import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  ResponseHeadersPolicy,
  S3OriginAccessControl,
  ViewerProtocolPolicy,
  type BehaviorOptions,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
} from "aws-cdk-lib/aws-s3";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import { DATA_PLANE } from "./data-plane.ts";
import { addDatasetJob } from "./dataset-job.ts";
import { IDENTITY } from "./identity.ts";
import { addLayoutJob } from "./layout-job.ts";

function privateBucket(scope: Construct, id: string, bucketName: string): Bucket {
  return new Bucket(scope, id, {
    bucketName,
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    encryption: BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
    removalPolicy: RemovalPolicy.RETAIN,
  });
}

function fixedTtlCache(scope: Construct, id: string, cachePolicyName: string, ttlSeconds: number): CachePolicy {
  const ttl = Duration.seconds(ttlSeconds);
  return new CachePolicy(scope, id, {
    cachePolicyName,
    minTtl: Duration.seconds(0),
    defaultTtl: ttl,
    maxTtl: ttl,
    enableAcceptEncodingGzip: true,
    enableAcceptEncodingBrotli: true,
  });
}

function readBehavior(
  origin: BehaviorOptions["origin"],
  cachePolicy: CachePolicy,
  cors: ResponseHeadersPolicy,
): BehaviorOptions {
  return {
    origin,
    viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
    cachePolicy,
    responseHeadersPolicy: cors,
    compress: true,
  };
}

function publicDistribution(stack: Stack, bucket: Bucket): void {
  const origin = S3BucketOrigin.withOriginAccessControl(bucket, {
    originAccessControl: new S3OriginAccessControl(stack, "PublicOriginAccessControl", {
      originAccessControlName: DATA_PLANE.originAccessControlName,
    }),
  });
  const cors = new ResponseHeadersPolicy(stack, "PublicCors", {
    responseHeadersPolicyName: DATA_PLANE.corsPolicyName,
    corsBehavior: {
      accessControlAllowCredentials: false,
      accessControlAllowHeaders: ["*"],
      accessControlAllowMethods: ["GET", "HEAD"],
      accessControlAllowOrigins: ["*"],
      originOverride: true,
    },
  });
  const immutable = fixedTtlCache(
    stack,
    "ImmutableCache",
    DATA_PLANE.immutableCachePolicyName,
    DATA_PLANE.immutableTtlSeconds,
  );
  const pointer = fixedTtlCache(
    stack,
    "PointerCache",
    DATA_PLANE.pointerCachePolicyName,
    DATA_PLANE.pointerTtlSeconds,
  );
  const additionalBehaviors: Record<string, BehaviorOptions> = {};
  for (const path of DATA_PLANE.pointerPaths) {
    additionalBehaviors[path] = readBehavior(origin, pointer, cors);
  }
  const distribution = new Distribution(stack, "PublicDistribution", {
    comment: DATA_PLANE.distributionComment,
    defaultBehavior: readBehavior(origin, immutable, cors),
    additionalBehaviors,
  });
  new CfnOutput(stack, DATA_PLANE.distributionDomainOutput, {
    value: distribution.distributionDomainName,
  });
  new CfnOutput(stack, DATA_PLANE.distributionIdOutput, {
    value: distribution.distributionId,
  });
}

export class VisaSpotterStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    new StringParameter(this, "Marker", {
      parameterName: `/${IDENTITY.stackName}/marker`,
      stringValue: IDENTITY.stackName,
    });
    const publicBucket = privateBucket(this, "PublicIndex", DATA_PLANE.publicBucketName);
    publicDistribution(this, publicBucket);
    const rawBucket = privateBucket(this, "RawDatasets", DATA_PLANE.rawBucketName);
    const operations = new Table(this, "Operations", {
      tableName: DATA_PLANE.tableName,
      partitionKey: { name: DATA_PLANE.partitionKey, type: AttributeType.STRING },
      sortKey: { name: DATA_PLANE.sortKey, type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.RETAIN,
    });
    addDatasetJob(this, { raw: rawBucket, public: publicBucket, table: operations });
    addLayoutJob(this, operations);
  }
}
