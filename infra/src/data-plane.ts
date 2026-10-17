import { IDENTITY } from "./identity.ts";

export const DATA_PLANE = {
  publicBucketName: `${IDENTITY.stackName}-public-${IDENTITY.account}`,
  rawBucketName: `${IDENTITY.stackName}-raw-${IDENTITY.account}`,
  tableName: IDENTITY.stackName,
  partitionKey: "pk",
  sortKey: "sk",
} as const;
