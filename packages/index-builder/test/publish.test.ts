import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NORMALIZER_VERSION, normalizeCompanyName } from "@visaspotter/domain";
import { buildIndex, buildShards, shardIndex, SHARD_COUNT } from "../src/build.ts";
import { fiscalYearsOf, INDEX_POINTER_KEYS, indexPointer, indexVersionFor, publishPlan } from "../src/publish.ts";

const fixturePath = new URL("../fixtures/employer-hub-sample.csv", import.meta.url);
const fixture = readFileSync(fixturePath, "utf8");
const builtAt = "2026-10-17T00:00:00.000Z";
const day = new Date(builtAt);

test("the publish plan names 256 versioned shards and then the two current pointers", () => {
  const built = buildIndex(fixture, "idx-test");
  const pointer = indexPointer({
    indexVersion: "idx-test",
    builtAt,
    fiscalYears: fiscalYearsOf(built.companies),
  });
  const plan = publishPlan({ shards: built.shards, pointer });

  assert.deepEqual(
    plan.shards.map((object) => object.key),
    Array.from({ length: SHARD_COUNT }, (_, index) => `v1/index/idx-test/${index}.json`),
  );
  assert.deepEqual(
    plan.pointers.map((object) => object.key),
    [...INDEX_POINTER_KEYS],
  );
  assert.equal(plan.pointers[0]?.body, plan.pointers[1]?.body);
  assert.equal(plan.shards[0]?.cacheControl, "public, max-age=31536000, immutable");
  assert.equal(plan.pointers[0]?.cacheControl, "public, max-age=3600");
  assert.equal(plan.shards[0]?.contentType, "application/json");

  const body = JSON.parse(plan.pointers[0]?.body ?? "");
  assert.deepEqual(body, {
    indexVersion: "idx-test",
    normalizerVersion: NORMALIZER_VERSION,
    shardCount: SHARD_COUNT,
    shardKeyPrefix: "v1/index/idx-test/",
    builtAt,
    fiscalYears: [2020, 2021, 2022, 2023, 2024],
  });

  const googleKey = normalizeCompanyName("GOOGLE LLC");
  const google = JSON.parse(plan.shards[shardIndex(googleKey)]?.body ?? "");
  assert.equal(google.indexVersion, "idx-test");
  assert.equal(google.entries.google.n, "GOOGLE LLC");
  assert.equal(google.entries.google.l, "frequent");
});

test("the index version follows the shard bytes and ignores the draft label", () => {
  const first = buildIndex(fixture, "draft-a");
  const second = buildIndex(fixture, "draft-b");
  assert.equal(indexVersionFor(first.shards, day), indexVersionFor(second.shards, day));
  assert.match(indexVersionFor(first.shards, day), /^idx-20261017-[0-9a-f]{8}$/);
  assert.notEqual(
    indexVersionFor(first.shards, day),
    indexVersionFor(first.shards, new Date("2026-10-18T00:00:00.000Z")),
  );

  const renamed = buildShards(
    first.companies.map((company) =>
      company.displayName === "TINY CO" ? { ...company, displayName: "TINY CORP" } : company,
    ),
    "draft-a",
  );
  assert.notEqual(indexVersionFor(first.shards, day), indexVersionFor(renamed, day));
});

test("dry-run prints shard keys before the pointer and does not call AWS", () => {
  const result = runCli([
    "--csv",
    fixturePath.pathname,
    "--bucket",
    "example-bucket",
    "--dry-run",
    "--built-at",
    builtAt,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  const pointer = JSON.parse(lines.at(-1) ?? "");
  assert.equal(pointer.shardCount, SHARD_COUNT);
  assert.equal(pointer.normalizerVersion, NORMALIZER_VERSION);
  assert.equal(pointer.shardKeyPrefix, `v1/index/${pointer.indexVersion}/`);
  assert.deepEqual(pointer.fiscalYears, [2020, 2021, 2022, 2023, 2024]);
  assert.match(pointer.indexVersion, /^idx-20261017-[0-9a-f]{8}$/);
  const shardLine = `v1/index/${pointer.indexVersion}/0.json`;
  const shardAt = lines.indexOf(shardLine);
  const pointerAt = lines.indexOf("v1/index/current.json");
  const aliasAt = lines.indexOf("index/current.json");
  assert.ok(shardAt >= 0);
  assert.ok(shardAt < pointerAt);
  assert.equal(aliasAt, pointerAt + 1);
  assert.equal(lines.filter((line) => line.startsWith(`v1/index/${pointer.indexVersion}/`)).length, SHARD_COUNT);
});

test("two fiscal-year files become one pointer", () => {
  const dir = mkdtempSync(join(tmpdir(), "visaspotter-csv-"));
  const header =
    "Fiscal Year,Employer,Initial Approval,Initial Denial,Continuing Approval,Continuing Denial";
  const older = join(dir, "2022.csv");
  const newer = join(dir, "2024.csv");
  writeFileSync(older, `${header}\n2022,ACME INC,1,0,0,0\n`);
  writeFileSync(newer, `${header}\n2024,BETA LLC,3,0,0,0\n`);
  const result = runCli([
    "--csv",
    older,
    "--csv",
    newer,
    "--bucket",
    "example-bucket",
    "--dry-run",
    "--built-at",
    builtAt,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const pointer = JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "");
  assert.deepEqual(pointer.fiscalYears, [2022, 2024]);
  assert.equal(pointer.shardCount, SHARD_COUNT);
});

test("an empty employer file does not publish a pointer", () => {
  const dir = mkdtempSync(join(tmpdir(), "visaspotter-empty-"));
  const csv = join(dir, "empty.csv");
  writeFileSync(csv, "Fiscal Year,Employer,Initial Approval,Initial Denial,Continuing Approval,Continuing Denial\n");
  const result = runCli(["--csv", csv, "--bucket", "example-bucket", "--dry-run", "--built-at", builtAt]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /empty index/);
  assert.equal(result.stdout.includes("v1/index/current.json"), false);
});

test("a bucket publish without a distribution exits 1 before AWS", () => {
  const result = runCli(["--csv", fixturePath.pathname, "--bucket", "example-bucket", "--built-at", builtAt]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--distribution/);
});

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const cli = new URL("../src/cli.ts", import.meta.url);
  const result = spawnSync(process.execPath, ["--experimental-strip-types", cli.pathname, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      AWS_PROFILE: "",
      AWS_ACCESS_KEY_ID: "",
      AWS_SECRET_ACCESS_KEY: "",
      AWS_SESSION_TOKEN: "",
      PATH: "/usr/bin:/bin",
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
