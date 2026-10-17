import path from "node:path";
import { fileURLToPath } from "node:url";
import { App, Aspects, Tags } from "aws-cdk-lib";
import { IDENTITY } from "./identity.ts";
import { RequireNamePrefix } from "./prefix-aspect.ts";
import { VisaSpotterStack } from "./stack.ts";

export function createApp(autoSynth = false): App {
  const app = new App({ autoSynth });
  for (const [key, value] of Object.entries(IDENTITY.tags)) {
    Tags.of(app).add(key, value);
  }
  Aspects.of(app).add(new RequireNamePrefix(IDENTITY.namePrefix));
  new VisaSpotterStack(app, IDENTITY.stackName, {
    stackName: IDENTITY.stackName,
    env: {
      account: IDENTITY.account,
      region: IDENTITY.region,
    },
  });
  return app;
}

const entry = process.argv[1];
if (entry && path.resolve(entry) === fileURLToPath(import.meta.url)) {
  createApp(true);
}
