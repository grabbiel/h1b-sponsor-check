import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { App, Aspects, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { createApp } from "../src/app.ts";
import { IDENTITY } from "../src/identity.ts";
import { RequireNamePrefix } from "../src/prefix-aspect.ts";

const env = { account: IDENTITY.account, region: IDENTITY.region };

function fixtureApp(): App {
  const app = new App({ autoSynth: false });
  Aspects.of(app).add(new RequireNamePrefix(IDENTITY.namePrefix));
  return app;
}

test("synth rejects an explicit name that omits the visaspotter prefix", () => {
  const app = fixtureApp();
  const stack = new Stack(app, "bad", { env });
  new Bucket(stack, "Open", { bucketName: "public-uploads" });
  assert.throws(() => app.synth(), /public-uploads/);
});

test("synth allows a bucket with no explicit name", () => {
  const app = fixtureApp();
  const stack = new Stack(app, "generated", { env });
  new Bucket(stack, "Assets");
  app.synth();
});

test("synth allows an explicit name that includes the visaspotter prefix", () => {
  const app = fixtureApp();
  const stack = new Stack(app, "named", { env });
  new Bucket(stack, "Public", {
    bucketName: "visaspotter-dev-public-028658486564",
  });
  app.synth();
});

test("visaspotter-dev tags the marker and stays inside the data plane", () => {
  const app = createApp();
  const assembly = app.synth();
  const template = Template.fromJSON(
    assembly.getStackByName(IDENTITY.stackName).template,
  );
  template.resourceCountIs("AWS::SSM::Parameter", 1);
  template.hasResourceProperties("AWS::SSM::Parameter", {
    Name: "/visaspotter-dev/marker",
    Type: "String",
    Value: "visaspotter-dev",
    Tags: {
      Project: "visaspotter",
      Environment: "dev",
      ManagedBy: "cdk",
    },
  });
  const resources = template.toJSON().Resources as Record<string, { Type: string }>;
  const types = Object.values(resources).map((resource) => resource.Type).sort();
  assert.deepEqual(
    types.filter((type) => type !== "AWS::CDK::Metadata"),
    [
      "AWS::DynamoDB::Table",
      "AWS::S3::Bucket",
      "AWS::S3::Bucket",
      "AWS::S3::BucketPolicy",
      "AWS::S3::BucketPolicy",
      "AWS::SSM::Parameter",
    ],
  );
});

test("data plane buckets stay private and the ops table is on-demand", () => {
  const app = createApp();
  const template = Template.fromJSON(
    app.synth().getStackByName(IDENTITY.stackName).template,
  );
  const bucketContract = {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    OwnershipControls: {
      Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }],
    },
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
      ],
    },
  };
  template.hasResource("AWS::S3::Bucket", {
    DeletionPolicy: "Retain",
    Properties: {
      BucketName: "visaspotter-dev-public-028658486564",
      ...bucketContract,
    },
  });
  template.hasResource("AWS::S3::Bucket", {
    DeletionPolicy: "Retain",
    Properties: {
      BucketName: "visaspotter-dev-raw-028658486564",
      ...bucketContract,
    },
  });
  template.resourceCountIs("AWS::S3::Bucket", 2);
  const buckets = template.findResources("AWS::S3::Bucket");
  for (const bucket of Object.values(buckets)) {
    const tags = bucket.Properties.Tags as Array<{ Key: string; Value: string }>;
    assert.deepEqual(
      tags.map((tag) => [tag.Key, tag.Value]).sort(),
      [
        ["Environment", "dev"],
        ["ManagedBy", "cdk"],
        ["Project", "visaspotter"],
      ],
    );
  }
  const policies = template.findResources("AWS::S3::BucketPolicy");
  assert.equal(Object.keys(policies).length, 2);
  for (const policy of Object.values(policies)) {
    const statements = policy.Properties.PolicyDocument.Statement as Array<{
      Effect: string;
      Condition?: { Bool?: Record<string, string> };
    }>;
    assert.ok(
      statements.some(
        (statement) =>
          statement.Effect === "Deny" &&
          statement.Condition?.Bool?.["aws:SecureTransport"] === "false",
      ),
    );
  }
  template.hasResource("AWS::DynamoDB::Table", {
    DeletionPolicy: "Retain",
    Properties: {
      TableName: "visaspotter-dev",
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
    },
  });
  const tables = template.findResources("AWS::DynamoDB::Table");
  assert.equal(Object.keys(tables).length, 1);
  for (const table of Object.values(tables)) {
    assert.equal(table.Properties.GlobalSecondaryIndexes, undefined);
    assert.equal(table.Properties.LocalSecondaryIndexes, undefined);
    const tags = table.Properties.Tags as Array<{ Key: string; Value: string }>;
    assert.deepEqual(
      tags.map((tag) => [tag.Key, tag.Value]).sort(),
      [
        ["Environment", "dev"],
        ["ManagedBy", "cdk"],
        ["Project", "visaspotter"],
      ],
    );
  }
});

test("cdk.json pins the dedicated toolkit stack and qualifier", () => {
  const cdk = JSON.parse(
    readFileSync(fileURLToPath(new URL("../cdk.json", import.meta.url)), "utf8"),
  ) as {
    toolkitStackName: string;
    context: Record<string, string>;
  };
  assert.equal(cdk.toolkitStackName, IDENTITY.toolkitStackName);
  assert.equal(
    cdk.context["@aws-cdk/core:bootstrapQualifier"],
    IDENTITY.bootstrapQualifier,
  );
});
