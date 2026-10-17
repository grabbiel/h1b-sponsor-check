import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { normalizeCompanyName } from "@visaspotter/domain";
import {
  buildIndex,
  companiesFromHubRows,
  fnv1a32,
  percentileNearestRank,
  shardIndex,
  SHARD_COUNT,
} from "../src/build.ts";
import { HubCsvError, parseHubCsv } from "../src/csv.ts";

const fixturePath = new URL("../fixtures/employer-hub-sample.csv", import.meta.url);
const fixture = readFileSync(fixturePath, "utf8");

test("quoted commas stay inside the employer name", () => {
  const rows = parseHubCsv(fixture);
  const vegas = rows.find((row) => row.employer.includes("VEGAS"));
  assert.equal(vegas?.employer, "2K VEGAS, INC.");
  assert.equal(vegas?.initialApprovals, 4);
});

test("a header that is not the hub layout fails", () => {
  assert.throws(() => parseHubCsv("Name,Count\nAcme,1\n"), (error: unknown) => {
    assert.ok(error instanceof HubCsvError);
    assert.match(error.message, /missing hub columns: fiscalYear/);
    return true;
  });
});

test("google spellings merge and filings older than five years drop", () => {
  const companies = companiesFromHubRows(parseHubCsv(fixture));
  const google = companies.find((company) => company.key === normalizeCompanyName("GOOGLE LLC"));
  assert.ok(google);
  assert.equal(google.displayName, "GOOGLE LLC");
  assert.equal(google.likelihood, "frequent");
  assert.deepEqual(
    google.records.map((record) => [record.fiscalYear, record.initialApprovals]),
    [
      [2023, 80],
      [2024, 105],
    ],
  );
  assert.equal(companies.some((company) => company.key === "ancient"), false);
  assert.equal(companies.length, 7);
});

test("names that share a first token share a shard", () => {
  assert.equal(fnv1a32("a"), 0xe40c292c);
  assert.equal(shardIndex("acme robotics labs"), shardIndex("acme labs"));
  assert.notEqual(shardIndex("acme robotics labs"), shardIndex("google"));
});

test("gzip percentiles use nearest rank on a sorted list", () => {
  assert.equal(percentileNearestRank([10, 20, 30, 40, 100], 50), 30);
  assert.equal(percentileNearestRank([10, 20, 30, 40, 100], 99), 100);
});

test("the builder writes 256 shard files and a size report", () => {
  const built = buildIndex(fixture, "idx-test");
  assert.equal(built.shards.length, SHARD_COUNT);
  assert.equal(built.report.distinctEmployers, 7);
  assert.ok(built.report.gzipMax >= built.report.gzipP99);
  assert.ok(built.report.gzipP99 >= built.report.gzipP50);
  assert.ok(built.report.gzipMax > 0);

  const dir = mkdtempSync(join(tmpdir(), "visaspotter-shards-"));
  const cli = new URL("../src/cli.ts", import.meta.url);
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", cli.pathname, "--csv", fixturePath.pathname, "--out", dir],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /distinct employers: 7/);
  assert.match(result.stdout, /gzip bytes p50: \d+/);
  assert.match(result.stdout, /gzip bytes p99: \d+/);
  assert.match(result.stdout, /gzip bytes max: \d+/);
  assert.equal(readdirSync(dir).length, SHARD_COUNT);

  const googleKey = normalizeCompanyName("GOOGLE LLC");
  const shard = JSON.parse(readFileSync(join(dir, `${shardIndex(googleKey)}.json`), "utf8"));
  assert.equal(shard.entries.google.n, "GOOGLE LLC");
  assert.equal(shard.entries.google.l, "frequent");
  assert.deepEqual(shard.entries.google.y["2024"], [105, 2, 401, 3]);
  const vegas = JSON.parse(readFileSync(join(dir, `${shardIndex("2k vegas")}.json`), "utf8"));
  assert.equal(vegas.entries["2k vegas"].n, "2K VEGAS, INC.");
});

test("a csv with the wrong header exits 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "visaspotter-bad-csv-"));
  const csv = join(dir, "bad.csv");
  writeFileSync(csv, "Name,Count\nAcme,1\n");
  const cli = new URL("../src/cli.ts", import.meta.url);
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", cli.pathname, "--csv", csv, "--out", join(dir, "out")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing hub columns/);
});
