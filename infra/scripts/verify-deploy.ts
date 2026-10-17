import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
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
]) as { Stacks: Array<{ StackStatus: string; Tags: Tag[] }> };
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
    },
    null,
    2,
  ),
);
