import path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, type Stack } from "aws-cdk-lib";
import type { Table } from "aws-cdk-lib/aws-dynamodb";
import { Rule, RuleTargetInput, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Architecture, FunctionUrlAuthType, HttpMethod, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { ALERT_LAYOUT_PK, HEALTH_PK_PREFIX, LAYOUT_PK_PREFIX } from "@visaspotter/layout-job/keys";
import { DATA_PLANE } from "./data-plane.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function bundlingEntry(fileName: string): string {
  return fileURLToPath(new URL(`../../packages/layout-job/src/${fileName}`, import.meta.url));
}

function lambdaBundling() {
  return {
    forceDockerBundling: false,
    format: OutputFormat.CJS,
    target: "node22",
    bundleAwsSDK: true,
    sourceMap: true,
  };
}

function leadingKeys(table: Table, actions: string[], keys: string[]): PolicyStatement {
  return new PolicyStatement({
    effect: Effect.ALLOW,
    actions,
    resources: [table.tableArn],
    conditions: {
      "ForAllValues:StringLike": {
        "dynamodb:LeadingKeys": keys,
      },
    },
  });
}

export function addLayoutJob(stack: Stack, table: Table): void {
  const layoutLogs = new LogGroup(stack, "LayoutLogs", {
    logGroupName: DATA_PLANE.layoutLogGroupName,
    retention: RetentionDays.TWO_WEEKS,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  const reportLogs = new LogGroup(stack, "ReportLogs", {
    logGroupName: DATA_PLANE.reportsLogGroupName,
    retention: RetentionDays.TWO_WEEKS,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  const layout = new NodejsFunction(stack, "LayoutHealth", {
    functionName: DATA_PLANE.layoutFunctionName,
    runtime: Runtime.NODEJS_22_X,
    architecture: Architecture.ARM_64,
    entry: bundlingEntry("layout-lambda.ts"),
    handler: "handler",
    memorySize: 256,
    timeout: Duration.seconds(30),
    logGroup: layoutLogs,
    environment: {
      ALERTS_ENABLED: "false",
      TABLE_NAME: DATA_PLANE.tableName,
    },
    projectRoot: repoRoot,
    depsLockFilePath: path.join(repoRoot, "package-lock.json"),
    bundling: lambdaBundling(),
  });
  const reports = new NodejsFunction(stack, "Reports", {
    functionName: DATA_PLANE.reportsFunctionName,
    runtime: Runtime.NODEJS_22_X,
    architecture: Architecture.ARM_64,
    entry: bundlingEntry("report-lambda.ts"),
    handler: "handler",
    memorySize: 256,
    timeout: Duration.seconds(10),
    logGroup: reportLogs,
    environment: {
      TABLE_NAME: DATA_PLANE.tableName,
    },
    projectRoot: repoRoot,
    depsLockFilePath: path.join(repoRoot, "package-lock.json"),
    bundling: lambdaBundling(),
  });
  layout.addToRolePolicy(leadingKeys(table, ["dynamodb:Query"], [`${HEALTH_PK_PREFIX}*`]));
  layout.addToRolePolicy(leadingKeys(table, ["dynamodb:GetItem"], [`${LAYOUT_PK_PREFIX}*`]));
  layout.addToRolePolicy(
    leadingKeys(table, ["dynamodb:PutItem"], [`${LAYOUT_PK_PREFIX}*`, ALERT_LAYOUT_PK]),
  );
  reports.addToRolePolicy(leadingKeys(table, ["dynamodb:UpdateItem"], [`${HEALTH_PK_PREFIX}*`]));
  const url = reports.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: ["*"],
      allowedMethods: [HttpMethod.POST],
      allowedHeaders: ["content-type"],
    },
  });
  new CfnOutput(stack, DATA_PLANE.reportsUrlOutput, { value: url.url });
  new Rule(stack, "LayoutDaily", {
    ruleName: DATA_PLANE.layoutRuleName,
    schedule: Schedule.expression(DATA_PLANE.layoutSchedule),
    targets: [
      new LambdaFunction(layout, {
        event: RuleTargetInput.fromObject({ mode: "aggregate" }),
      }),
    ],
  });
}
