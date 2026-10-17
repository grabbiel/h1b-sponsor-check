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

test("visaspotter-dev publishes one tagged marker parameter", () => {
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
    ["AWS::SSM::Parameter"],
  );
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
