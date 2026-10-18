import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    invalidatePointers(distribution, plan);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function uploadPlan(bucket: string, plan: PublishPlan, shardKeyPrefix: string): void {
  const dir = mkdtempSync(join(tmpdir(), "visaspotter-publish-"));
  try {
    const shardDir = join(dir, "shards");
    mkdirSync(shardDir);
    for (const object of plan.shards) {
      const name = object.key.split("/").at(-1);
      if (name === undefined || name.length === 0) throw new Error(`shard key ${object.key} has no file name`);
      writeFileSync(join(shardDir, name), object.body);
    }
    runAws([
      "s3",
      "sync",
      shardDir,
      `s3://${bucket}/${shardKeyPrefix}`,
      "--content-type",
      "application/json",
      "--cache-control",
      SHARD_CACHE_CONTROL,
      "--only-show-errors",
    ]);
    const pointerFile = join(dir, "current.json");
    for (const object of plan.pointers) {
      writeFileSync(pointerFile, object.body);
      runAws([
        "s3api",
        "put-object",
        "--bucket",
        bucket,
        "--key",
        object.key,
        "--body",
        pointerFile,
        "--content-type",
        "application/json",
        "--cache-control",
        object.cacheControl,
      ]);
      process.stdout.write(`pointer s3://${bucket}/${object.key}\n`);
    }
    process.stdout.write(`uploaded s3://${bucket}/${shardKeyPrefix}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function invalidatePointers(distributionId: string, plan: PublishPlan): void {
  runAws([
    "cloudfront",
    "create-invalidation",
    "--distribution-id",
    distributionId,
    "--paths",
    ...plan.pointers.map((object) => `/${object.key}`),
  ]);
}

function runAws(args: string[]): void {
  const result = spawnSync("aws", ["--no-cli-pager", ...args], {
    encoding: "utf8",
    env: { ...process.env, AWS_PAGER: "" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr}${result.stdout}`.trim();
    throw new Error(detail || `aws exited ${result.status}`);
  }
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
}

function checkBucketName(name: string): void {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)) throw new Error(`bucket ${name} is not a bucket name`);
}

function checkDistributionId(id: string): void {
  if (!/^E[A-Z0-9]+$/.test(id)) throw new Error(`distribution ${id} is not a distribution id`);
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
