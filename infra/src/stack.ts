import { Stack, type StackProps } from "aws-cdk-lib";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import { IDENTITY } from "./identity.ts";

export class VisaSpotterStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    new StringParameter(this, "Marker", {
      parameterName: `/${IDENTITY.stackName}/marker`,
      stringValue: IDENTITY.stackName,
    });
  }
}
