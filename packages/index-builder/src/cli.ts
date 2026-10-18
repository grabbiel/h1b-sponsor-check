import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkBucketName, checkDistributionId, invalidate, putObjects, runAws } from "./aws.ts";
import { buildShards, companiesFromHubRows, formatReport, sizeReport, writeShards } from "./build.ts";
import { parseHubCsv } from "./csv.ts";
import {
  fiscalYearsOf,
  indexPointer,
  indexVersionFor,
  publishPlan,
  SHARD_CACHE_CONTROL,
  type PublishPlan,
} from "./publish.ts";

const csvPaths = argumentsOf("--csv");
const outDir = argument("--out");
const bucket = argument("--bucket");
const distribution = argument("--distribution");
const builtAtArg = argument("--built-at");
const dryRun = process.argv.includes("--dry-run");

if (csvPaths.length === 0 || (outDir === undefined && bucket === undefined)) {
  process.stderr.write(
    [
      "Usage: node --experimental-strip-types packages/index-builder/src/cli.ts --csv <file> [--csv <file>...] --out <dir>",
      "       node --experimental-strip-types packages/index-builder/src/cli.ts --csv <file> [--csv <file>...] --bucket <name> --distribution <id>",
      "Reads USCIS H-1B Employer Data Hub CSVs. Repeat --csv to combine fiscal-year files.",
      "Required columns are Fiscal Year, Employer, Initial Approval, Initial Denial, Continuing Approval, and Continuing Denial.",
      "--out writes local files 0.json through 255.json.",
      "--bucket uploads v1/index/<indexVersion>/<shard>.json, then v1/index/current.json and index/current.json.",
      "--dry-run prints those keys and does not call AWS.",
      "Put downloaded files in data/raw/. That directory is gitignored.",
      "Example file: https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-2023.csv",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

try {
  const builtAt = builtAtArg === undefined ? new Date() : new Date(builtAtArg);
  if (Number.isNaN(builtAt.getTime())) throw new Error("--built-at is not a time");
  const texts = csvPaths.map((path) => readFileSync(path, "utf8"));
  const companies = companiesFromHubRows(texts.flatMap((text) => parseHubCsv(text)));
  if (bucket !== undefined && companies.length === 0) throw new Error("empty index");
  const indexVersion = indexVersionFor(buildShards(companies, "idx-pending"), builtAt);
  const shards = buildShards(companies, indexVersion);
  const pointer = indexPointer({
    indexVersion,
    builtAt: builtAt.toISOString(),
    fiscalYears: fiscalYearsOf(companies),
  });
  const plan = publishPlan({ shards, pointer });

  if (outDir !== undefined) writeShards(outDir, shards);
  process.stdout.write(`${formatReport(sizeReport(companies, shards))}\n`);
  process.stdout.write(`indexVersion: ${indexVersion}\n`);

  if (bucket !== undefined && dryRun) {
    for (const object of [...plan.shards, ...plan.pointers]) process.stdout.write(`${object.key}\n`);
    process.stdout.write(`${plan.pointers[0]?.body ?? ""}\n`);
  } else if (bucket !== undefined) {
    if (distribution === undefined) throw new Error("pass --distribution to invalidate the pointer cache");
    checkBucketName(bucket);
    checkDistributionId(distribution);
    uploadPlan(bucket, plan, pointer.shardKeyPrefix);
    invalidate(distribution, plan.pointers);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function uploadPlan(bucket: string, plan: PublishPlan, shardKeyPrefix: string): void {
  const dir = mkdtempSync(join(tmpdir(), "visaspotter-publish-"));
  try {
    for (const object of plan.shards) {
      const name = object.key.split("/").at(-1);
      if (name === undefined || name.length === 0) throw new Error(`shard key ${object.key} has no file name`);
      writeFileSync(join(dir, name), object.body);
    }
    runAws([
      "s3",
      "sync",
      dir,
      `s3://${bucket}/${shardKeyPrefix}`,
      "--content-type",
      "application/json",
      "--cache-control",
      SHARD_CACHE_CONTROL,
      "--only-show-errors",
    ]);
    process.stdout.write(`uploaded s3://${bucket}/${shardKeyPrefix}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  putObjects(bucket, plan.pointers);
}

function argument(flag: string): string | undefined {
  return argumentsOf(flag)[0];
}

function argumentsOf(flag: string): string[] {
  const values: string[] = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] !== flag) continue;
    const value = process.argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      process.stderr.write(`${flag} needs a value\n`);
      process.exit(1);
    }
    values.push(value);
    index += 1;
  }
  return values;
}
