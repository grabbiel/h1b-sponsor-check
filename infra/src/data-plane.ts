import { IDENTITY } from "./identity.ts";

export const DATA_PLANE = {
  publicBucketName: `${IDENTITY.stackName}-public-${IDENTITY.account}`,
  rawBucketName: `${IDENTITY.stackName}-raw-${IDENTITY.account}`,
  tableName: IDENTITY.stackName,
  partitionKey: "pk",
  sortKey: "sk",
  originAccessControlName: `${IDENTITY.stackName}-public-oac`,
  pointerCachePolicyName: `${IDENTITY.stackName}-pointer`,
  immutableCachePolicyName: `${IDENTITY.stackName}-immutable`,
  corsPolicyName: `${IDENTITY.stackName}-cors`,
  distributionComment: `${IDENTITY.stackName}-cdn`,
  distributionDomainOutput: "DistributionDomainName",
  distributionIdOutput: "DistributionId",
  pointerPaths: [
    "index/current.json",
    "config/current.json",
    "v1/index/current.json",
    "v1/config/current.json",
  ],
  pointerTtlSeconds: 3600,
  immutableTtlSeconds: 31536000,
} as const;
