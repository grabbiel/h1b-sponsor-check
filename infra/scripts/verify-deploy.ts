import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DATA_PLANE } from "../src/data-plane.ts";
import { IDENTITY } from "../src/identity.ts";

type Tag = { Key: string; Value: string };
type StackResource = { ResourceType: string; PhysicalResourceId?: string };

const allowedTypes = new Set([
  "AWS::SSM::Parameter",
  "AWS::CDK::Metadata",
  "AWS::S3::Bucket",
  "AWS::S3::BucketPolicy",
  "AWS::DynamoDB::Table",
  "AWS::CloudFront::Distribution",
  "AWS::CloudFront::OriginAccessControl",
  "AWS::CloudFront::CachePolicy",
  "AWS::CloudFront::ResponseHeadersPolicy",
  "AWS::Lambda::Function",
  "AWS::Lambda::Permission",
  "AWS::IAM::Role",
  "AWS::IAM::Policy",
  "AWS::Events::Rule",
  "AWS::Logs::LogGroup",
  "AWS::Lambda::Url",
]);

function aws(args: string[]): unknown {
  const env = { ...process.env };
  delete env.HTTP_PROXY;
  delete env.HTTPS_PROXY;
  delete env.http_proxy;
  delete env.https_proxy;
  delete env.ALL_PROXY;
  delete env.all_proxy;
  env.AWS_PROFILE = env.AWS_PROFILE ?? "grabbiel-farrot-dev";
  env.AWS_REGION = env.AWS_REGION ?? IDENTITY.region;
  const stdout = execFileSync("aws", args, { encoding: "utf8", env });
  if (stdout.trim() === "") return {};
  return JSON.parse(stdout);
}

function tagMap(tags: Tag[]): Map<string, string> {
  return new Map(tags.map((tag) => [tag.Key, tag.Value]));
}

function assertTags(tags: Tag[], where: string): void {
  const found = tagMap(tags);
  for (const [key, value] of Object.entries(IDENTITY.tags)) {
    assert.equal(found.get(key), value, `${where} tag ${key}`);
  }
}

type PolicyStatement = {
  Effect: string;
  Action?: string | string[];
  Principal?: { Service?: string | string[] };
  Condition?: { StringEquals?: Record<string, string> };
};

function bucketStatements(bucket: string): PolicyStatement[] {
  const got = aws([
    "s3api",
    "get-bucket-policy",
    "--bucket",
    bucket,
    "--output",
    "json",
  ]) as { Policy: string };
  return (JSON.parse(got.Policy) as { Statement: PolicyStatement[] }).Statement;
}

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function cachePolicyConfig(id: string): {
  Name: string;
  DefaultTTL: number;
  MaxTTL: number;
  MinTTL: number;
} {
  const got = aws([
    "cloudfront",
    "get-cache-policy",
    "--id",
    id,
    "--output",
    "json",
  ]) as {
    CachePolicy: {
      CachePolicyConfig: { Name: string; DefaultTTL: number; MaxTTL: number; MinTTL: number };
    };
  };
  return got.CachePolicy.CachePolicyConfig;
}

function httpStatus(url: string): string {
  return execFileSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", url], {
    encoding: "utf8",
  }).trim();
}

function probeDistribution(domain: string, distributionId: string): void {
  const key = "probes/u04.txt";
  const body = "visaspotter-u04";
  const dir = mkdtempSync(join(tmpdir(), "visaspotter-u04-"));
  const file = join(dir, "body.txt");
  writeFileSync(file, body);
  const cdnUrl = `https://${domain}/${key}`;
  let uploaded = false;
  try {
    aws([
      "s3api",
      "put-object",
      "--bucket",
      DATA_PLANE.publicBucketName,
      "--key",
      key,
      "--body",
      file,
      "--cache-control",
      "max-age=0",
      "--content-type",
      "text/plain",
      "--output",
      "json",
    ]);
    uploaded = true;
    const s3Url = `https://${DATA_PLANE.publicBucketName}.s3.${IDENTITY.region}.amazonaws.com/${key}`;
    assert.equal(httpStatus(s3Url), "403", s3Url);
    const headerFile = join(dir, "headers.txt");
    const outFile = join(dir, "out.txt");
    let lastError = "cloudfront get did not succeed";
    let fetched = false;
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      try {
        execFileSync("curl", [
          "-fsS",
          "-D",
          headerFile,
          "-o",
          outFile,
          "-H",
          "Origin: https://example.invalid",
          cdnUrl,
        ]);
        fetched = true;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        execFileSync("sleep", ["6"]);
      }
    }
    assert.equal(fetched, true, lastError);
    assert.equal(readFileSync(outFile, "utf8"), body);
    const headers = readFileSync(headerFile, "utf8").toLowerCase();
    assert.ok(headers.includes("access-control-allow-origin: *"), headers);
  } finally {
    if (uploaded) {
      aws([
        "s3api",
        "delete-object",
        "--bucket",
        DATA_PLANE.publicBucketName,
        "--key",
        key,
        "--output",
        "json",
      ]);
    }
    rmSync(dir, { recursive: true, force: true });
  }
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (httpStatus(cdnUrl) !== "200") return;
    execFileSync("sleep", ["3"]);
  }
  const invalidation = aws([
    "cloudfront",
    "create-invalidation",
    "--distribution-id",
    distributionId,
    "--paths",
    `/${key}`,
    "--output",
    "json",
  ]) as { Invalidation: { Id: string } };
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const current = aws([
      "cloudfront",
      "get-invalidation",
      "--distribution-id",
      distributionId,
      "--id",
      invalidation.Invalidation.Id,
      "--output",
      "json",
    ]) as { Invalidation: { Status: string } };
    if (current.Invalidation.Status === "Completed" && httpStatus(cdnUrl) !== "200") return;
    execFileSync("sleep", ["6"]);
  }
  assert.notEqual(httpStatus(cdnUrl), "200", cdnUrl);
}

function physicalIds(resources: StackResource[], type: string): string[] {
  return resources
    .filter((resource) => resource.ResourceType === type)
    .map((resource) => {
      assert.ok(resource.PhysicalResourceId, type);
      return resource.PhysicalResourceId;
    });
}

const identity = aws([
  "sts",
  "get-caller-identity",
  "--output",
  "json",
]) as { Account: string };
assert.equal(identity.Account, IDENTITY.account);

const described = aws([
  "cloudformation",
  "describe-stacks",
  "--stack-name",
  IDENTITY.stackName,
  "--output",
  "json",
]) as {
  Stacks: Array<{
    StackStatus: string;
    Tags: Tag[];
    Outputs?: Array<{ OutputKey: string; OutputValue: string }>;
  }>;
};
const stack = described.Stacks[0];
assert.ok(stack, IDENTITY.stackName);
assert.ok(
  stack.StackStatus === "CREATE_COMPLETE" || stack.StackStatus === "UPDATE_COMPLETE",
  stack.StackStatus,
);
assert.ok(IDENTITY.stackName.startsWith(IDENTITY.namePrefix), IDENTITY.stackName);
assertTags(stack.Tags, IDENTITY.stackName);

const listed = aws([
  "cloudformation",
  "list-stack-resources",
  "--stack-name",
  IDENTITY.stackName,
  "--output",
  "json",
]) as { StackResourceSummaries: StackResource[] };
assert.ok(listed.StackResourceSummaries.length > 0);
for (const resource of listed.StackResourceSummaries) {
  assert.ok(allowedTypes.has(resource.ResourceType), resource.ResourceType);
}

const bucketNames = physicalIds(listed.StackResourceSummaries, "AWS::S3::Bucket").sort();
assert.deepEqual(
  bucketNames,
  [DATA_PLANE.publicBucketName, DATA_PLANE.rawBucketName].sort(),
);
for (const bucket of bucketNames) {
  assert.ok(bucket.startsWith(IDENTITY.namePrefix), bucket);
  const block = aws([
    "s3api",
    "get-public-access-block",
    "--bucket",
    bucket,
    "--output",
    "json",
  ]) as {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: boolean;
      IgnorePublicAcls: boolean;
      BlockPublicPolicy: boolean;
      RestrictPublicBuckets: boolean;
    };
  };
  const access = block.PublicAccessBlockConfiguration;
  assert.equal(access.BlockPublicAcls, true, bucket);
  assert.equal(access.IgnorePublicAcls, true, bucket);
  assert.equal(access.BlockPublicPolicy, true, bucket);
  assert.equal(access.RestrictPublicBuckets, true, bucket);
  const ownership = aws([
    "s3api",
    "get-bucket-ownership-controls",
    "--bucket",
    bucket,
    "--output",
    "json",
  ]) as { OwnershipControls: { Rules: Array<{ ObjectOwnership: string }> } };
  assert.equal(
    ownership.OwnershipControls.Rules[0]?.ObjectOwnership,
    "BucketOwnerEnforced",
    bucket,
  );
  const publicity = aws([
    "s3api",
    "get-bucket-policy-status",
    "--bucket",
    bucket,
    "--output",
    "json",
  ]) as { PolicyStatus: { IsPublic: boolean } };
  assert.equal(publicity.PolicyStatus.IsPublic, false, bucket);
  const encryption = aws([
    "s3api",
    "get-bucket-encryption",
    "--bucket",
    bucket,
    "--output",
    "json",
  ]) as {
    ServerSideEncryptionConfiguration: {
      Rules: Array<{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: string } }>;
    };
  };
  assert.equal(
    encryption.ServerSideEncryptionConfiguration.Rules[0]?.ApplyServerSideEncryptionByDefault
      .SSEAlgorithm,
    "AES256",
    bucket,
  );
  const tagging = aws([
    "s3api",
    "get-bucket-tagging",
    "--bucket",
    bucket,
    "--output",
    "json",
  ]) as { TagSet: Tag[] };
  assertTags(tagging.TagSet, bucket);
}

const tableIds = physicalIds(listed.StackResourceSummaries, "AWS::DynamoDB::Table");
assert.deepEqual(tableIds, [DATA_PLANE.tableName]);
const describedTable = aws([
  "dynamodb",
  "describe-table",
  "--table-name",
  DATA_PLANE.tableName,
  "--output",
  "json",
]) as {
  Table: {
    TableName: string;
    TableArn: string;
    BillingModeSummary?: { BillingMode: string };
    KeySchema: Array<{ AttributeName: string; KeyType: string }>;
    AttributeDefinitions: Array<{ AttributeName: string; AttributeType: string }>;
    GlobalSecondaryIndexes?: unknown;
  };
};
const table = describedTable.Table;
assert.equal(table.TableName, DATA_PLANE.tableName);
assert.ok(table.TableName.startsWith(IDENTITY.namePrefix), table.TableName);
assert.equal(table.BillingModeSummary?.BillingMode, "PAY_PER_REQUEST");
assert.deepEqual(table.KeySchema, [
  { AttributeName: DATA_PLANE.partitionKey, KeyType: "HASH" },
  { AttributeName: DATA_PLANE.sortKey, KeyType: "RANGE" },
]);
assert.deepEqual(table.AttributeDefinitions, [
  { AttributeName: DATA_PLANE.partitionKey, AttributeType: "S" },
  { AttributeName: DATA_PLANE.sortKey, AttributeType: "S" },
]);
assert.equal(table.GlobalSecondaryIndexes, undefined);
const tableTags = aws([
  "dynamodb",
  "list-tags-of-resource",
  "--resource-arn",
  table.TableArn,
  "--output",
  "json",
]) as { Tags: Tag[] };
assertTags(tableTags.Tags, table.TableName);

const parameterTags = aws([
  "ssm",
  "list-tags-for-resource",
  "--resource-type",
  "Parameter",
  "--resource-id",
  `/${IDENTITY.stackName}/marker`,
  "--output",
  "json",
]) as { TagList: Tag[] };
assertTags(parameterTags.TagList, "marker parameter");

const toolkit = aws([
  "cloudformation",
  "describe-stacks",
  "--stack-name",
  IDENTITY.toolkitStackName,
  "--output",
  "json",
]) as { Stacks: Array<{ StackStatus: string; Tags: Tag[] }> };
const toolkitStack = toolkit.Stacks[0];
assert.ok(toolkitStack, IDENTITY.toolkitStackName);
assert.ok(
  toolkitStack.StackStatus === "CREATE_COMPLETE" ||
    toolkitStack.StackStatus === "UPDATE_COMPLETE",
  toolkitStack.StackStatus,
);
assertTags(toolkitStack.Tags, IDENTITY.toolkitStackName);

const distributionIds = physicalIds(
  listed.StackResourceSummaries,
  "AWS::CloudFront::Distribution",
);
assert.equal(distributionIds.length, 1);
const distributionId = distributionIds[0];
assert.ok(distributionId);
const originAccessControlIds = physicalIds(
  listed.StackResourceSummaries,
  "AWS::CloudFront::OriginAccessControl",
);
assert.equal(originAccessControlIds.length, 1);
const describedDistribution = aws([
  "cloudfront",
  "get-distribution",
  "--id",
  distributionId,
  "--output",
  "json",
]) as {
  Distribution: {
    Id: string;
    ARN: string;
    Status: string;
    DomainName: string;
    DistributionConfig: {
      Enabled: boolean;
      Comment: string;
      Aliases: { Quantity: number };
      ViewerCertificate: { CloudFrontDefaultCertificate?: boolean };
      Origins: { Items: Array<{ DomainName: string; OriginAccessControlId?: string }> };
      DefaultCacheBehavior: {
        ViewerProtocolPolicy: string;
        CachePolicyId: string;
        ResponseHeadersPolicyId: string;
        AllowedMethods: { Items: string[] };
        LambdaFunctionAssociations?: { Quantity: number };
      };
      CacheBehaviors: {
        Items?: Array<{
          PathPattern: string;
          ViewerProtocolPolicy: string;
          CachePolicyId: string;
          ResponseHeadersPolicyId: string;
          AllowedMethods: { Items: string[] };
        }>;
      };
    };
  };
};
const distribution = describedDistribution.Distribution;
assert.equal(distribution.Status, "Deployed");
assert.equal(distribution.Id, distributionId);
assert.equal(distribution.DistributionConfig.Enabled, true);
assert.equal(distribution.DistributionConfig.Comment, DATA_PLANE.distributionComment);
assert.equal(distribution.DistributionConfig.Aliases.Quantity, 0);
assert.equal(
  distribution.DistributionConfig.ViewerCertificate.CloudFrontDefaultCertificate,
  true,
);
assert.equal(distribution.DistributionConfig.Origins.Items.length, 1);
const origin = distribution.DistributionConfig.Origins.Items[0];
assert.ok(origin);
assert.equal(origin.OriginAccessControlId, originAccessControlIds[0]);
assert.ok(origin.DomainName.startsWith(`${DATA_PLANE.publicBucketName}.s3.`), origin.DomainName);
const defaultBehavior = distribution.DistributionConfig.DefaultCacheBehavior;
assert.equal(defaultBehavior.ViewerProtocolPolicy, "redirect-to-https");
assert.deepEqual([...defaultBehavior.AllowedMethods.Items].sort(), ["GET", "HEAD"]);
assert.equal(defaultBehavior.LambdaFunctionAssociations?.Quantity ?? 0, 0);
const immutableCache = cachePolicyConfig(defaultBehavior.CachePolicyId);
assert.equal(immutableCache.Name, DATA_PLANE.immutableCachePolicyName);
assert.equal(immutableCache.DefaultTTL, DATA_PLANE.immutableTtlSeconds);
assert.equal(immutableCache.MaxTTL, DATA_PLANE.immutableTtlSeconds);
assert.equal(immutableCache.MinTTL, 0);
const behaviors = distribution.DistributionConfig.CacheBehaviors.Items ?? [];
assert.deepEqual(
  behaviors.map((behavior) => behavior.PathPattern),
  [...DATA_PLANE.pointerPaths],
);
for (const behavior of behaviors) {
  assert.equal(behavior.ViewerProtocolPolicy, "redirect-to-https");
  assert.deepEqual([...behavior.AllowedMethods.Items].sort(), ["GET", "HEAD"]);
  assert.equal(behavior.ResponseHeadersPolicyId, defaultBehavior.ResponseHeadersPolicyId);
  const pointerCache = cachePolicyConfig(behavior.CachePolicyId);
  assert.equal(pointerCache.Name, DATA_PLANE.pointerCachePolicyName);
  assert.equal(pointerCache.DefaultTTL, DATA_PLANE.pointerTtlSeconds);
  assert.equal(pointerCache.MaxTTL, DATA_PLANE.pointerTtlSeconds);
  assert.equal(pointerCache.MinTTL, 0);
}
const describedHeaders = aws([
  "cloudfront",
  "get-response-headers-policy",
  "--id",
  defaultBehavior.ResponseHeadersPolicyId,
  "--output",
  "json",
]) as {
  ResponseHeadersPolicy: {
    ResponseHeadersPolicyConfig: {
      Name: string;
      CorsConfig: {
        AccessControlAllowOrigins: { Items: string[] };
        AccessControlAllowMethods: { Items: string[] };
        AccessControlAllowCredentials: boolean;
        OriginOverride: boolean;
      };
    };
  };
};
const cors = describedHeaders.ResponseHeadersPolicy.ResponseHeadersPolicyConfig;
assert.equal(cors.Name, DATA_PLANE.corsPolicyName);
assert.deepEqual(cors.CorsConfig.AccessControlAllowOrigins.Items, ["*"]);
assert.deepEqual([...cors.CorsConfig.AccessControlAllowMethods.Items].sort(), ["GET", "HEAD"]);
assert.equal(cors.CorsConfig.AccessControlAllowCredentials, false);
assert.equal(cors.CorsConfig.OriginOverride, true);
const outputMap = new Map(
  (stack.Outputs ?? []).map((output) => [output.OutputKey, output.OutputValue]),
);
assert.equal(outputMap.get(DATA_PLANE.distributionIdOutput), distributionId);
assert.equal(outputMap.get(DATA_PLANE.distributionDomainOutput), distribution.DomainName);
const distributionTags = aws([
  "cloudfront",
  "list-tags-for-resource",
  "--resource",
  distribution.ARN,
  "--output",
  "json",
]) as { Tags: { Items: Tag[] } };
assertTags(distributionTags.Tags.Items, distribution.DomainName);
const publicStatements = bucketStatements(DATA_PLANE.publicBucketName);
const cloudFrontAllows = publicStatements.filter(
  (statement) =>
    statement.Effect === "Allow" &&
    asList(statement.Principal?.Service).includes("cloudfront.amazonaws.com"),
);
assert.equal(cloudFrontAllows.length, 1);
const cloudFrontAllow = cloudFrontAllows[0];
assert.ok(cloudFrontAllow);
assert.deepEqual(asList(cloudFrontAllow.Action), ["s3:GetObject"]);
assert.equal(
  cloudFrontAllow.Condition?.StringEquals?.["AWS:SourceArn"],
  `arn:aws:cloudfront::${IDENTITY.account}:distribution/${distributionId}`,
);
assert.equal(publicStatements.filter((statement) => statement.Effect === "Allow").length, 1);
const rawStatements = bucketStatements(DATA_PLANE.rawBucketName);
assert.equal(
  rawStatements.some(
    (statement) =>
      statement.Effect === "Allow" ||
      asList(statement.Principal?.Service).includes("cloudfront.amazonaws.com"),
  ),
  false,
);
probeDistribution(distribution.DomainName, distributionId);

console.log(
  JSON.stringify(
    {
      account: identity.Account,
      stack: IDENTITY.stackName,
      stackStatus: stack.StackStatus,
      resources: listed.StackResourceSummaries.map((resource) => resource.ResourceType),
      buckets: bucketNames,
      table: table.TableName,
      tableBilling: table.BillingModeSummary?.BillingMode,
      toolkit: IDENTITY.toolkitStackName,
      toolkitStatus: toolkitStack.StackStatus,
      distributionId,
      distributionDomain: distribution.DomainName,
      distributionStatus: distribution.Status,
    },
    null,
    2,
  ),
);
