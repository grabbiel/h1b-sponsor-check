import path from "node:path";
import { fileURLToPath } from "node:url";
import { Duration, RemovalPolicy, type Stack } from "aws-cdk-lib";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import { Rule, RuleTargetInput, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { Bucket } from "aws-cdk-lib/aws-s3";
import { POINTER_KEYS, RAW_KEY_PREFIX, SHARD_KEY_PREFIX } from "@visaspotter/dataset-job/keys";
import { DATA_PLANE } from "./data-plane.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export function addDatasetJob(
  stack: Stack,
  buckets: { raw: Bucket; public: Bucket; table: Table },
): void {
  const logGroup = new LogGroup(stack, "DatasetLogs", {
    logGroupName: DATA_PLANE.datasetLogGroupName,
    retention: RetentionDays.TWO_WEEKS,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  const fn = new NodejsFunction(stack, "Dataset", {
    functionName: DATA_PLANE.datasetFunctionName,
    runtime: Runtime.NODEJS_22_X,
    architecture: Architecture.ARM_64,
    entry: fileURLToPath(new URL("../../packages/dataset-job/src/lambda.ts", import.meta.url)),
    handler: "handler",
    memorySize: 2048,
    timeout: Duration.minutes(15),
    logGroup,
    environment: {
      ALERTS_ENABLED: "false",
      RAW_BUCKET: DATA_PLANE.rawBucketName,
      PUBLIC_BUCKET: DATA_PLANE.publicBucketName,
      TABLE_NAME: DATA_PLANE.tableName,
      HUB_URL: DATA_PLANE.hubUrl,
    },
    projectRoot: repoRoot,
    depsLockFilePath: path.join(repoRoot, "package-lock.json"),
    bundling: {
      forceDockerBundling: false,
      format: OutputFormat.CJS,
      target: "node22",
      bundleAwsSDK: true,
      sourceMap: true,
    },
  });
  buckets.raw.grantRead(fn, `${RAW_KEY_PREFIX}*`);
  buckets.raw.grantPut(fn, `${RAW_KEY_PREFIX}*`);
  buckets.public.grantPut(fn, `${SHARD_KEY_PREFIX}*`);
  for (const key of POINTER_KEYS) {
    if (key.startsWith(SHARD_KEY_PREFIX)) continue;
    buckets.public.grantPut(fn, key);
  }
  buckets.table.grantReadWriteData(fn);
  new Rule(stack, "DatasetWatch", {
    ruleName: DATA_PLANE.datasetRuleName,
    schedule: Schedule.rate(Duration.days(14)),
    targets: [
      new LambdaFunction(fn, {
        event: RuleTargetInput.fromObject({ mode: "watch" }),
      }),
    ],
  });
}
