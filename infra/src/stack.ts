import { RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
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
import { IDENTITY } from "./identity.ts";

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

export class VisaSpotterStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    new StringParameter(this, "Marker", {
      parameterName: `/${IDENTITY.stackName}/marker`,
      stringValue: IDENTITY.stackName,
    });
    // CloudFront OAC is the later reader. Direct public access stays off.
    privateBucket(this, "PublicIndex", DATA_PLANE.publicBucketName);
    privateBucket(this, "RawDatasets", DATA_PLANE.rawBucketName);
    new Table(this, "Operations", {
      tableName: DATA_PLANE.tableName,
      partitionKey: { name: DATA_PLANE.partitionKey, type: AttributeType.STRING },
      sortKey: { name: DATA_PLANE.sortKey, type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
