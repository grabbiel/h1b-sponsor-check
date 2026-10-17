declare const namePrefixBrand: unique symbol;

export type NamePrefix = string & { readonly [namePrefixBrand]: "NamePrefix" };

export type VisaSpotterTags = {
  readonly Project: "visaspotter";
  readonly Environment: "dev";
  readonly ManagedBy: "cdk";
};

export type StackIdentity = {
  readonly project: "visaspotter";
  readonly environment: "dev";
  readonly account: "028658486564";
  readonly region: "us-east-1";
  readonly stackName: "visaspotter-dev";
  readonly namePrefix: NamePrefix;
  readonly toolkitStackName: "visaspotter-cdk-toolkit";
  readonly bootstrapQualifier: "visaspot";
  readonly tags: VisaSpotterTags;
};

function namePrefix(value: "visaspotter-"): NamePrefix {
  return value;
}

export const IDENTITY: StackIdentity = {
  project: "visaspotter",
  environment: "dev",
  account: "028658486564",
  region: "us-east-1",
  stackName: "visaspotter-dev",
  namePrefix: namePrefix("visaspotter-"),
  toolkitStackName: "visaspotter-cdk-toolkit",
  bootstrapQualifier: "visaspot",
  tags: {
    Project: "visaspotter",
    Environment: "dev",
    ManagedBy: "cdk",
  },
};
