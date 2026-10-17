import { CfnResource, Token, type IAspect } from "aws-cdk-lib";
import type { IConstruct } from "constructs";
import type { NamePrefix } from "./identity.ts";

const PHYSICAL_NAME_FIELDS = [
  "alarmName",
  "aliasName",
  "bucketName",
  "clusterName",
  "dbClusterIdentifier",
  "dbInstanceIdentifier",
  "domainName",
  "functionName",
  "groupName",
  "hostedZoneName",
  "loadBalancerName",
  "logGroupName",
  "name",
  "policyName",
  "queueName",
  "repositoryName",
  "roleName",
  "scheduleName",
  "streamName",
  "tableName",
  "topicName",
] as const;

function explicitNames(node: CfnResource): string[] {
  const fields = node as unknown as Record<string, unknown>;
  const names: string[] = [];
  for (const key of PHYSICAL_NAME_FIELDS) {
    const value = fields[key];
    if (typeof value !== "string") continue;
    if (Token.isUnresolved(value)) continue;
    names.push(value);
  }
  return names;
}

export class RequireNamePrefix implements IAspect {
  private readonly prefix: NamePrefix;

  constructor(prefix: NamePrefix) {
    this.prefix = prefix;
  }

  visit(node: IConstruct): void {
    if (!CfnResource.isCfnResource(node)) return;
    const prefix = this.prefix;
    node.node.addValidation({
      validate() {
        return explicitNames(node)
          .filter((name) => !name.includes(prefix))
          .map((name) => `Physical name "${name}" must include "${prefix}".`);
      },
    });
  }
}
