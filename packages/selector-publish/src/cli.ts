import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { checkBucketName, checkDistributionId, invalidate, putObjects } from "@visaspotter/index-builder/aws";
import { acceptedPack, selectorPublishPlan } from "./publish.ts";

const { values } = parseArgs({
  options: {
    bucket: { type: "string" },
    distribution: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

if (values.bucket === undefined) {
  process.stderr.write(
    [
      "Usage: node --experimental-strip-types packages/selector-publish/src/cli.ts --bucket <name> --distribution <id> [--dry-run]",
      "Reads packages/selector-client/packs/linkedin.json and indeed.json, the packs the extension bundles.",
      "Uploads v1/selectors/<platform>/<version>-<contentHash>.json, then the v1/selectors/current.json pointer.",
      "--dry-run prints the keys and the pointer body and does not call AWS.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

try {
  const plan = selectorPublishPlan({
    linkedin: await acceptedPack(bundledPack("linkedin"), "linkedin"),
    indeed: await acceptedPack(bundledPack("indeed"), "indeed"),
  });
  if (values["dry-run"]) {
    for (const object of [...plan.packs, plan.pointer]) process.stdout.write(`${object.key}\n`);
    process.stdout.write(`${plan.pointer.body}\n`);
  } else {
    if (values.distribution === undefined) throw new Error("pass --distribution to invalidate the pointer cache");
    checkBucketName(values.bucket);
    checkDistributionId(values.distribution);
    putObjects(values.bucket, plan.packs);
    putObjects(values.bucket, [plan.pointer]);
    invalidate(values.distribution, [plan.pointer]);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function bundledPack(platform: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../selector-client/packs/${platform}.json`, import.meta.url), "utf8"));
}
