import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { IDENTITY } from "../src/identity.ts";

type Tag = { Key: string; Value: string };
type StackResource = { ResourceType: string; PhysicalResourceId?: string };

const allowedTypes = new Set(["AWS::SSM::Parameter", "AWS::CDK::Metadata"]);

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
      toolkit: IDENTITY.toolkitStackName,
      toolkitStatus: toolkitStack.StackStatus,
    },
    null,
    2,
  ),
);
