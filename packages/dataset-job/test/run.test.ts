import assert from "node:assert/strict";
import test from "node:test";
import { POINTER_KEYS, SHARD_KEY_PREFIX } from "../src/keys.ts";
import {
  runDataset,
  type DatasetEnv,
  type DatasetPorts,
  type OpsItem,
  type RawCsv,
  type StoredObject,
} from "../src/run.ts";

const HUB = "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub";
const FILES = "https://www.uscis.gov/archive/h-1b-employer-data-hub-files";
const NOW = "2026-10-17T18:00:00.000Z";

const CSV = [
  "Fiscal Year,Employer,Initial Approval,Initial Denial,Continuing Approval,Continuing Denial",
  '2024,"2K VEGAS, INC.",4,1,10,0',
  "2024,GOOGLE LLC,100,2,400,3",
].join("\n");

const CSV_URL = "https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-2024.csv";

function csvFor(year: number): string {
  return [
    "Fiscal Year,Employer,Initial Approval,Initial Denial,Continuing Approval,Continuing Denial",
    `${year},ACME LLC,2,0,1,0`,
  ].join("\n");
}

function yearUrl(year: number): string {
  return `https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-${year}.csv`;
}

function harness(options: {
  pages?: Record<string, { status: number; body: string }>;
  raw?: RawCsv[];
  alertsEnabled?: boolean;
  fetchError?: string;
}) {
  const objects: StoredObject[] = [];
  const items: OpsItem[] = [];
  const fetches: string[] = [];
  const ports: DatasetPorts = {
    fetchText: async (url) => {
      fetches.push(url);
      if (options.fetchError !== undefined) throw new Error(options.fetchError);
      return options.pages?.[url] ?? { status: 404, body: "" };
    },
    hasSnapshot: async (fingerprint) =>
      items.some((item) => item.kind === "dataset-snapshot" && item.fingerprint === fingerprint),
    listRawCsv: async () => options.raw ?? [],
    putObject: async (object) => {
      objects.push(object);
    },
    putItem: async (item) => {
      items.push(item);
    },
  };
  const env: DatasetEnv = {
    alertsEnabled: options.alertsEnabled ?? false,
    hubUrl: HUB,
    now: NOW,
  };
  return { ports, env, objects, items, fetches };
}

function checks(items: readonly OpsItem[]) {
  return items.filter((item) => item.kind === "dataset-check");
}

function alerts(items: readonly OpsItem[]) {
  return items.filter((item) => item.kind === "alert-log");
}

test("a hub page with no csv link follows the files page and publishes both pointers", async () => {
  const box = harness({
    pages: {
      [HUB]: { status: 200, body: `<a href="/archive/h-1b-employer-data-hub-files">files</a>` },
      [FILES]: { status: 200, body: `<a href="${CSV_URL}">2024</a>` },
      [CSV_URL]: { status: 200, body: CSV },
    },
  });
  const result = await runDataset({ mode: "watch" }, box.ports, box.env);
  assert.equal(result.outcome, "changed");
  assert.deepEqual(box.fetches, [HUB, FILES, CSV_URL]);
  assert.equal(box.objects.some((object) => object.body.includes("2K VEGAS, INC.")), true);

  const publicKeys = box.objects.filter((object) => object.bucket === "public").map((object) => object.key);
  assert.equal(publicKeys.at(-2), POINTER_KEYS[0]);
  assert.equal(publicKeys.at(-1), POINTER_KEYS[1]);
  assert.equal(publicKeys.length, 258);
  for (const key of publicKeys.slice(0, 256)) {
    assert.equal(key.startsWith(`${SHARD_KEY_PREFIX}${result.indexVersion}/`), true);
  }
  const pointer = box.objects.find((object) => object.key === POINTER_KEYS[0]);
  const legacy = box.objects.find((object) => object.key === POINTER_KEYS[1]);
  assert.ok(pointer);
  assert.equal(pointer.body, legacy?.body);
  const parsed = JSON.parse(pointer.body) as {
    indexVersion: string;
    normalizerVersion: number;
    shardCount: number;
    shardKeyPrefix: string;
    fiscalYears: number[];
  };
  assert.equal(parsed.indexVersion, result.indexVersion);
  assert.match(parsed.indexVersion, /^idx-20261017-[0-9a-f]{8}$/);
  assert.equal(parsed.normalizerVersion, 1);
  assert.equal(parsed.shardCount, 256);
  assert.equal(parsed.shardKeyPrefix, `${SHARD_KEY_PREFIX}${parsed.indexVersion}/`);
  assert.deepEqual(parsed.fiscalYears, [2024]);
  assert.equal(box.objects.some((object) => object.bucket === "raw" && object.key.startsWith("raw/uscis/2024/")), true);

  const check = checks(box.items).at(-1);
  assert.equal(check?.status, "changed");
  const alert = alerts(box.items).at(-1);
  assert.equal(alert?.pk, "ALERT#dataset-changed");
  assert.equal(alert?.status, "suppressed");
  assert.equal(alert?.reason, "alerts-disabled");
  const snapshot = box.items.find((item) => item.kind === "dataset-snapshot");
  assert.equal(snapshot?.sk, `FP#${result.fingerprint}`);
});

test("csv links already on the hub page skip the files page", async () => {
  const box = harness({
    pages: {
      [HUB]: {
        status: 200,
        body: `<a href="/archive/h-1b-employer-data-hub-files">files</a><a href="${CSV_URL}">2024</a>`,
      },
      [CSV_URL]: { status: 200, body: CSV },
    },
  });
  const result = await runDataset(undefined, box.ports, box.env);
  assert.equal(result.outcome, "changed");
  assert.deepEqual(box.fetches, [HUB, CSV_URL]);
});

test("the five newest fiscal years are the only csv downloads", async () => {
  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const pages: Record<string, { status: number; body: string }> = {
    [HUB]: {
      status: 200,
      body: years.map((year) => `<a href="${yearUrl(year)}">${year}</a>`).join(""),
    },
  };
  for (const year of years) pages[yearUrl(year)] = { status: 200, body: csvFor(year) };
  const box = harness({ pages });
  const result = await runDataset({ mode: "watch" }, box.ports, box.env);
  assert.equal(result.outcome, "changed");
  assert.deepEqual(box.fetches, [HUB, yearUrl(2026), yearUrl(2025), yearUrl(2024), yearUrl(2023), yearUrl(2022)]);
});

test("a second watch of the same files does not publish again", async () => {
  const box = harness({
    pages: {
      [HUB]: { status: 200, body: `<a href="${CSV_URL}">2024</a>` },
      [CSV_URL]: { status: 200, body: CSV },
    },
  });
  const first = await runDataset({ mode: "watch" }, box.ports, box.env);
  const published = box.objects.length;
  const second = await runDataset({ mode: "watch" }, box.ports, box.env);
  assert.equal(first.outcome, "changed");
  assert.equal(second.outcome, "unchanged");
  assert.equal(second.fingerprint, first.fingerprint);
  assert.equal(box.objects.length, published);
  assert.equal(checks(box.items).at(-1)?.status, "unchanged");
  assert.equal(alerts(box.items).filter((alert) => alert.pk === "ALERT#dataset-changed").length, 1);
});

test("no csv link and no files page keeps the index and records dataset-needs-operator", async () => {
  const box = harness({
    pages: {
      [HUB]: { status: 200, body: "<p>The hub is a dashboard.</p>" },
    },
  });
  const result = await runDataset({ mode: "watch" }, box.ports, box.env);
  assert.deepEqual(result, { outcome: "needs-operator", error: "dataset-needs-operator" });
  assert.equal(box.objects.length, 0);
  const check = checks(box.items)[0];
  assert.equal(check?.status, "failed");
  if (check?.status === "failed") assert.equal(check.error, "dataset-needs-operator");
  const alert = alerts(box.items)[0];
  assert.equal(alert?.pk, "ALERT#dataset-needs-operator");
  assert.equal(alert?.sk, "hub-no-csv");
  assert.equal(alert?.status, "suppressed");
});

test("an off-site csv link is ignored", async () => {
  const box = harness({
    pages: {
      [HUB]: { status: 200, body: `<a href="https://evil.example/h1b_datahubexport-2024.csv">x</a>` },
    },
  });
  const result = await runDataset({ mode: "watch" }, box.ports, box.env);
  assert.equal(result.outcome, "needs-operator");
  assert.deepEqual(box.fetches, [HUB]);
  assert.equal(box.objects.length, 0);
});

test("an off-site files page is not fetched", async () => {
  const box = harness({
    pages: {
      [HUB]: { status: 200, body: `<a href="https://evil.example/h-1b-employer-data-hub-files">files</a>` },
    },
  });
  const result = await runDataset({ mode: "watch" }, box.ports, box.env);
  assert.equal(result.outcome, "needs-operator");
  assert.deepEqual(box.fetches, [HUB]);
});

test("a hub HTTP error does not publish", async () => {
  const box = harness({ pages: { [HUB]: { status: 403, body: "blocked" } } });
  const result = await runDataset({ mode: "watch" }, box.ports, box.env);
  assert.deepEqual(result, { outcome: "failed", error: "hub-http-403" });
  assert.equal(box.objects.length, 0);
  const alert = alerts(box.items)[0];
  assert.equal(alert?.pk, "ALERT#dataset-failed");
  assert.equal(alert?.status, "suppressed");
});

test("a csv HTTP error does not publish a partial index", async () => {
  const box = harness({
    pages: {
      [HUB]: { status: 200, body: `<a href="${CSV_URL}">2024</a>` },
      [CSV_URL]: { status: 500, body: "" },
    },
  });
  const result = await runDataset({ mode: "watch" }, box.ports, box.env);
  assert.deepEqual(result, { outcome: "failed", error: "csv-http-2024-500" });
  assert.equal(box.objects.length, 0);
});

test("a header that is not the hub layout does not publish", async () => {
  const box = harness({
    raw: [{ fiscalYear: 2024, body: "Name,Count\nAcme,1\n" }],
  });
  const result = await runDataset({ mode: "build" }, box.ports, box.env);
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") assert.match(result.error, /missing hub columns/);
  assert.equal(box.objects.length, 0);
  assert.equal(box.fetches.length, 0);
});

test("build mode publishes a csv already in raw storage", async () => {
  const box = harness({ raw: [{ fiscalYear: 2024, body: CSV }] });
  const result = await runDataset({ mode: "build" }, box.ports, box.env);
  assert.equal(result.outcome, "changed");
  assert.equal(box.fetches.length, 0);
  assert.equal(box.objects.some((object) => object.body.includes("2K VEGAS, INC.")), true);
});

test("build mode with no raw csv records a failure and leaves the index", async () => {
  const box = harness({ raw: [] });
  const result = await runDataset({ mode: "build" }, box.ports, box.env);
  assert.deepEqual(result, { outcome: "failed", error: "no-raw-csv" });
  assert.equal(box.objects.length, 0);
});

test("an empty employer file does not replace the index", async () => {
  const body = [
    "Fiscal Year,Employer,Initial Approval,Initial Denial,Continuing Approval,Continuing Denial",
    "2024,,1,0,0,0",
  ].join("\n");
  const box = harness({ raw: [{ fiscalYear: 2024, body }] });
  const result = await runDataset({ mode: "build" }, box.ports, box.env);
  assert.deepEqual(result, { outcome: "failed", error: "empty-index" });
  assert.equal(box.objects.length, 0);
});

test("alerts stay suppressed when the flag is on because SES is not wired", async () => {
  const box = harness({
    alertsEnabled: true,
    pages: { [HUB]: { status: 200, body: "<p>no files</p>" } },
  });
  await runDataset({ mode: "watch" }, box.ports, box.env);
  const alert = alerts(box.items)[0];
  assert.equal(alert?.status, "suppressed");
  assert.equal(alert?.reason, "ses-not-wired");
});

test("an unknown mode records a failure and does not publish", async () => {
  const box = harness({ raw: [{ fiscalYear: 2024, body: CSV }] });
  const result = await runDataset({ mode: "send" }, box.ports, box.env);
  assert.deepEqual(result, { outcome: "failed", error: "bad-mode" });
  assert.equal(box.objects.length, 0);
});

test("a string payload is accepted for watch", async () => {
  const box = harness({
    pages: {
      [HUB]: { status: 200, body: `<a href="${CSV_URL}">2024</a>` },
      [CSV_URL]: { status: 200, body: CSV },
    },
  });
  const result = await runDataset(JSON.stringify({ mode: "watch" }), box.ports, box.env);
  assert.equal(result.outcome, "changed");
});

test("duplicate raw objects with the same bytes publish once", async () => {
  const box = harness({
    raw: [
      { fiscalYear: 2024, body: CSV },
      { fiscalYear: 2024, body: CSV },
    ],
  });
  const once = harness({ raw: [{ fiscalYear: 2024, body: CSV }] });
  const duplicated = await runDataset({ mode: "build" }, box.ports, box.env);
  const single = await runDataset({ mode: "build" }, once.ports, once.env);
  assert.equal(duplicated.fingerprint, single.fingerprint);
  assert.equal(box.objects.filter((object) => object.bucket === "raw").length, 1);
});

test("check rows expire after 180 days", async () => {
  const box = harness({ pages: { [HUB]: { status: 403, body: "" } } });
  await runDataset({ mode: "watch" }, box.ports, box.env);
  const check = checks(box.items)[0];
  assert.equal(check?.ttl, Date.parse(NOW) / 1000 + 180 * 24 * 60 * 60);
});
