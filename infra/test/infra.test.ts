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
      "AWS::CloudFront::CachePolicy",
      "AWS::CloudFront::CachePolicy",
      "AWS::CloudFront::Distribution",
      "AWS::CloudFront::OriginAccessControl",
      "AWS::CloudFront::ResponseHeadersPolicy",
      "AWS::DynamoDB::Table",
      "AWS::Events::Rule",
      "AWS::Events::Rule",
      "AWS::IAM::Policy",
      "AWS::IAM::Policy",
      "AWS::IAM::Policy",
      "AWS::IAM::Role",
      "AWS::IAM::Role",
      "AWS::IAM::Role",
      "AWS::Lambda::Function",
      "AWS::Lambda::Function",
      "AWS::Lambda::Function",
      "AWS::Lambda::Permission",
      "AWS::Lambda::Permission",
      "AWS::Lambda::Permission",
      "AWS::Lambda::Permission",
      "AWS::Lambda::Url",
      "AWS::Logs::LogGroup",
      "AWS::Logs::LogGroup",
      "AWS::Logs::LogGroup",
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
      TimeToLiveSpecification: {
        AttributeName: "ttl",
        Enabled: true,
      },
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

type TemplateResource = {
  Properties: Record<string, unknown>;
};

type CacheBehavior = {
  PathPattern?: string;
  AllowedMethods?: string[];
  CachePolicyId?: { Ref?: string };
  ResponseHeadersPolicyId?: { Ref?: string };
  ViewerProtocolPolicy?: string;
  Compress?: boolean;
  TargetOriginId?: string;
  LambdaFunctionAssociations?: unknown;
  FunctionAssociations?: unknown;
};

function stackTemplate(): Template {
  const app = createApp();
  return Template.fromJSON(app.synth().getStackByName(IDENTITY.stackName).template);
}

function oneResource(template: Template, type: string): TemplateResource {
  const found = template.findResources(type);
  const ids = Object.keys(found);
  assert.equal(ids.length, 1, type);
  return found[ids[0]!] as TemplateResource;
}

test("public index reads use origin access control, CORS, and pointer TTLs", () => {
  const template = stackTemplate();
  template.resourceCountIs("AWS::CertificateManager::Certificate", 0);
  const distribution = oneResource(template, "AWS::CloudFront::Distribution");
  const config = distribution.Properties.DistributionConfig as {
    Comment?: string;
    Aliases?: unknown;
    ViewerCertificate?: unknown;
    Enabled?: boolean;
    Origins?: Array<{
      Id?: string;
      DomainName?: { "Fn::GetAtt"?: [string, string] };
      OriginAccessControlId?: { "Fn::GetAtt"?: [string, string] };
      S3OriginConfig?: { OriginAccessIdentity?: string };
    }>;
    DefaultCacheBehavior?: CacheBehavior;
    CacheBehaviors?: CacheBehavior[];
  };
  assert.equal(config.Comment, "visaspotter-dev-cdn");
  assert.equal(config.Aliases, undefined);
  assert.equal(config.ViewerCertificate, undefined);
  assert.equal(config.Enabled, true);
  assert.equal(config.Origins?.length, 1);
  const origin = config.Origins?.[0];
  assert.ok(origin);
  assert.deepEqual(origin.S3OriginConfig, { OriginAccessIdentity: "" });
  const oacId = origin.OriginAccessControlId?.["Fn::GetAtt"]?.[0];
  assert.equal(typeof oacId, "string");
  const accessControls = template.findResources("AWS::CloudFront::OriginAccessControl");
  const accessControl = accessControls[oacId!] as TemplateResource;
  assert.equal(
    (accessControl.Properties.OriginAccessControlConfig as { Name: string }).Name,
    "visaspotter-dev-public-oac",
  );
  assert.equal(
    (accessControl.Properties.OriginAccessControlConfig as { SigningBehavior: string })
      .SigningBehavior,
    "always",
  );
  assert.equal(
    (accessControl.Properties.OriginAccessControlConfig as { OriginAccessControlOriginType: string })
      .OriginAccessControlOriginType,
    "s3",
  );
  const publicBucketId = origin.DomainName?.["Fn::GetAtt"]?.[0];
  const buckets = template.findResources("AWS::S3::Bucket");
  assert.equal(
    (buckets[publicBucketId!] as TemplateResource).Properties.BucketName,
    "visaspotter-dev-public-028658486564",
  );
  const behaviors = [config.DefaultCacheBehavior, ...(config.CacheBehaviors ?? [])];
  assert.equal(behaviors.length, 6);
  for (const behavior of behaviors) {
    assert.ok(behavior);
    assert.deepEqual(behavior.AllowedMethods, ["GET", "HEAD"]);
    assert.equal(behavior.ViewerProtocolPolicy, "redirect-to-https");
    assert.equal(behavior.Compress, true);
    assert.equal(behavior.TargetOriginId, origin.Id);
    assert.equal(behavior.LambdaFunctionAssociations, undefined);
    assert.equal(behavior.FunctionAssociations, undefined);
  }
  const policies = template.findResources("AWS::CloudFront::CachePolicy");
  const ttlById = new Map<string, { Name: string; DefaultTTL: number; MaxTTL: number; MinTTL: number }>();
  for (const [id, policy] of Object.entries(policies)) {
    const cache = (policy as TemplateResource).Properties.CachePolicyConfig as {
      Name: string;
      DefaultTTL: number;
      MaxTTL: number;
      MinTTL: number;
      ParametersInCacheKeyAndForwardedToOrigin: {
        CookiesConfig: { CookieBehavior: string };
        HeadersConfig: { HeaderBehavior: string };
        QueryStringsConfig: { QueryStringBehavior: string };
      };
    };
    assert.equal(cache.ParametersInCacheKeyAndForwardedToOrigin.CookiesConfig.CookieBehavior, "none");
    assert.equal(cache.ParametersInCacheKeyAndForwardedToOrigin.HeadersConfig.HeaderBehavior, "none");
    assert.equal(
      cache.ParametersInCacheKeyAndForwardedToOrigin.QueryStringsConfig.QueryStringBehavior,
      "none",
    );
    ttlById.set(id, {
      Name: cache.Name,
      DefaultTTL: cache.DefaultTTL,
      MaxTTL: cache.MaxTTL,
      MinTTL: cache.MinTTL,
    });
  }
  const defaultPolicyId = config.DefaultCacheBehavior?.CachePolicyId?.Ref;
  assert.equal(typeof defaultPolicyId, "string");
  assert.deepEqual(ttlById.get(defaultPolicyId!), {
    Name: "visaspotter-dev-immutable",
    DefaultTTL: 31536000,
    MaxTTL: 31536000,
    MinTTL: 0,
  });
  const pointerPatterns = (config.CacheBehaviors ?? []).map((behavior) => behavior.PathPattern);
  assert.deepEqual(pointerPatterns, [
    "index/current.json",
    "config/current.json",
    "v1/index/current.json",
    "v1/config/current.json",
    "v1/selectors/current.json",
  ]);
  for (const behavior of config.CacheBehaviors ?? []) {
    const policyId = behavior.CachePolicyId?.Ref;
    assert.deepEqual(ttlById.get(policyId!), {
      Name: "visaspotter-dev-pointer",
      DefaultTTL: 3600,
      MaxTTL: 3600,
      MinTTL: 0,
    });
  }
  const headerPolicies = template.findResources("AWS::CloudFront::ResponseHeadersPolicy");
  const headerPolicyId = config.DefaultCacheBehavior?.ResponseHeadersPolicyId?.Ref;
  assert.equal(typeof headerPolicyId, "string");
  const cors = (
    (headerPolicies[headerPolicyId!] as TemplateResource).Properties
      .ResponseHeadersPolicyConfig as {
      Name: string;
      CorsConfig: {
        AccessControlAllowOrigins: { Items: string[] };
        AccessControlAllowMethods: { Items: string[] };
        AccessControlAllowCredentials: boolean;
        OriginOverride: boolean;
      };
    }
  );
  assert.equal(cors.Name, "visaspotter-dev-cors");
  assert.deepEqual(cors.CorsConfig.AccessControlAllowOrigins.Items, ["*"]);
  assert.deepEqual(cors.CorsConfig.AccessControlAllowMethods.Items, ["GET", "HEAD"]);
  assert.equal(cors.CorsConfig.AccessControlAllowCredentials, false);
  assert.equal(cors.CorsConfig.OriginOverride, true);
  for (const behavior of config.CacheBehaviors ?? []) {
    assert.equal(behavior.ResponseHeadersPolicyId?.Ref, headerPolicyId);
  }
  const tags = distribution.Properties.Tags as Array<{ Key: string; Value: string }>;
  assert.deepEqual(
    tags.map((tag) => [tag.Key, tag.Value]).sort(),
    [
      ["Environment", "dev"],
      ["ManagedBy", "cdk"],
      ["Project", "visaspotter"],
    ],
  );
  const bucketPolicies = template.findResources("AWS::S3::BucketPolicy");
  const publicPolicy = Object.values(bucketPolicies).find(
    (policy) =>
      ((policy as TemplateResource).Properties.Bucket as { Ref?: string }).Ref === publicBucketId,
  ) as TemplateResource;
  const statements = (
    publicPolicy.Properties.PolicyDocument as {
      Statement: Array<{
        Effect: string;
        Action: string;
        Principal?: { Service?: string; AWS?: string };
        Condition?: { StringEquals?: Record<string, { "Fn::Join"?: unknown[] }> };
      }>;
    }
  ).Statement;
  const allows = statements.filter((statement) => statement.Effect === "Allow");
  assert.equal(allows.length, 1);
  const allow = allows[0];
  assert.ok(allow);
  assert.equal(allow.Action, "s3:GetObject");
  assert.equal(allow.Principal?.Service, "cloudfront.amazonaws.com");
  const distributionId = Object.keys(
    template.findResources("AWS::CloudFront::Distribution"),
  )[0];
  const sourceArn = allow.Condition?.StringEquals?.["AWS:SourceArn"]?.["Fn::Join"];
  assert.ok(sourceArn);
  assert.equal(JSON.stringify(sourceArn).includes(`"Ref":"${distributionId}"`), true);
  const rawPolicy = Object.values(bucketPolicies).find(
    (policy) =>
      ((policy as TemplateResource).Properties.Bucket as { Ref?: string }).Ref !== publicBucketId,
  ) as TemplateResource;
  const rawStatements = (
    rawPolicy.Properties.PolicyDocument as {
      Statement: Array<{ Effect: string; Principal?: { Service?: string } }>;
    }
  ).Statement;
  assert.equal(
    rawStatements.some(
      (statement) =>
        statement.Effect === "Allow" ||
        statement.Principal?.Service === "cloudfront.amazonaws.com",
    ),
    false,
  );
  const outputs = template.toJSON().Outputs as Record<string, { Value: unknown }>;
  assert.deepEqual(outputs.DistributionDomainName?.Value, {
    "Fn::GetAtt": [distributionId, "DomainName"],
  });
  assert.deepEqual(outputs.DistributionId?.Value, { Ref: distributionId });
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

test("the dataset rule runs visaspotter-dev-dataset every 14 days with alerts off", () => {
  const template = stackTemplate();
  template.resourceCountIs("AWS::Lambda::Function", 3);
  template.resourceCountIs("AWS::Events::Rule", 2);
  template.hasResourceProperties("AWS::Lambda::Function", {
    FunctionName: "visaspotter-dev-dataset",
    Runtime: "nodejs22.x",
    Architectures: ["arm64"],
    MemorySize: 2048,
    Timeout: 900,
    Environment: {
      Variables: {
        ALERTS_ENABLED: "false",
        RAW_BUCKET: "visaspotter-dev-raw-028658486564",
        PUBLIC_BUCKET: "visaspotter-dev-public-028658486564",
        TABLE_NAME: "visaspotter-dev",
        HUB_URL: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub",
      },
    },
  });
  template.hasResourceProperties("AWS::Events::Rule", {
    Name: "visaspotter-dev-dataset-watch",
    ScheduleExpression: "rate(14 days)",
    State: "ENABLED",
  });
  template.hasResourceProperties("AWS::Logs::LogGroup", {
    LogGroupName: "/aws/lambda/visaspotter-dev-dataset",
    RetentionInDays: 14,
  });
  const rules = template.findResources("AWS::Events::Rule");
  const rule = Object.values(rules).find(
    (candidate) =>
      (candidate as { Properties: { Name?: string } }).Properties.Name === "visaspotter-dev-dataset-watch",
  ) as {
    Properties: { Targets: Array<{ Input?: string; Arn?: { "Fn::GetAtt"?: string[] } }> };
  };
  assert.equal(rule.Properties.Targets.length, 1);
  const target = rule.Properties.Targets[0];
  assert.ok(target);
  assert.equal(target.Input, JSON.stringify({ mode: "watch" }));
  const functions = template.findResources("AWS::Lambda::Function");
  const functionId = Object.entries(functions).find(
    ([, fn]) =>
      (fn as { Properties: { FunctionName?: string } }).Properties.FunctionName === "visaspotter-dev-dataset",
  )?.[0];
  assert.equal(target.Arn?.["Fn::GetAtt"]?.[0], functionId);
  const json = JSON.stringify(template.toJSON());
  assert.equal(json.includes("ses:"), false);
  const policies = template.findResources("AWS::IAM::Policy");
  const policyText = JSON.stringify(policies);
  assert.equal(policyText.includes("s3:PutObject"), true);
  assert.equal(policyText.includes("s3:GetObject"), true);
  assert.equal(policyText.includes("dynamodb:PutItem"), true);
  assert.equal(policyText.includes("index/current.json"), true);
  assert.equal(policyText.includes("v1/index/*"), true);
  assert.equal(policyText.includes("raw/uscis/*"), true);
});

test("layout health runs daily and the report URL accepts anonymous posts", () => {
  const template = stackTemplate();
  template.hasResourceProperties("AWS::Lambda::Function", {
    FunctionName: "visaspotter-dev-layout-health",
    Runtime: "nodejs22.x",
    Architectures: ["arm64"],
    Timeout: 30,
    Environment: {
      Variables: {
        ALERTS_ENABLED: "false",
        TABLE_NAME: "visaspotter-dev",
      },
    },
  });
  template.hasResourceProperties("AWS::Lambda::Function", {
    FunctionName: "visaspotter-dev-reports",
    Runtime: "nodejs22.x",
    Timeout: 10,
    Environment: {
      Variables: {
        TABLE_NAME: "visaspotter-dev",
      },
    },
  });
  template.hasResourceProperties("AWS::Events::Rule", {
    Name: "visaspotter-dev-layout-health",
    ScheduleExpression: "cron(0 9 * * ? *)",
    State: "ENABLED",
  });
  const rules = template.findResources("AWS::Events::Rule");
  const layoutRule = Object.values(rules).find(
    (rule) => (rule as { Properties: { Name?: string } }).Properties.Name === "visaspotter-dev-layout-health",
  ) as { Properties: { Targets: Array<{ Input?: string; Arn?: { "Fn::GetAtt"?: string[] } }> } };
  assert.equal(layoutRule.Properties.Targets[0]?.Input, JSON.stringify({ mode: "aggregate" }));
  const layoutFunctionId = Object.entries(template.findResources("AWS::Lambda::Function")).find(
    ([, fn]) =>
      (fn as { Properties: { FunctionName?: string } }).Properties.FunctionName === "visaspotter-dev-layout-health",
  )?.[0];
  assert.equal(layoutRule.Properties.Targets[0]?.Arn?.["Fn::GetAtt"]?.[0], layoutFunctionId);
  const urls = template.findResources("AWS::Lambda::Url");
  assert.equal(Object.keys(urls).length, 1);
  const url = Object.values(urls)[0] as {
    Properties: { AuthType: string; Cors: { AllowOrigins: string[]; AllowMethods: string[] } };
  };
  assert.equal(url.Properties.AuthType, "NONE");
  assert.deepEqual(url.Properties.Cors.AllowOrigins, ["*"]);
  assert.deepEqual(url.Properties.Cors.AllowMethods, ["POST"]);
  const functions = template.findResources("AWS::Lambda::Function");
  for (const fn of Object.values(functions)) {
    const reserved = (fn as { Properties: { ReservedConcurrentExecutions?: number } }).Properties
      .ReservedConcurrentExecutions;
    assert.equal(reserved, undefined);
  }
  const policyText = JSON.stringify(template.findResources("AWS::IAM::Policy"));
  assert.equal(policyText.includes("HEALTH#*"), true);
  assert.equal(policyText.includes("UNMATCHED#*"), true);
  assert.equal(policyText.includes("LAYOUT#*"), true);
  assert.equal(policyText.includes("ALERT#layout"), true);
  assert.equal(policyText.includes("dynamodb:UpdateItem"), true);
  assert.equal(JSON.stringify(template.toJSON()).includes("ses:"), false);
  const outputs = template.toJSON().Outputs as Record<string, { Value: unknown }>;
  assert.ok(outputs.ReportsFunctionUrl);
});
