import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { companyVerdict, normalizeCompanyName } from "../../domain/src/index.ts";
import { buildIndex, shardIndex, shardJson } from "../../index-builder/src/build.ts";
import { INDEX_BASE, createIndexClient } from "../src/client.js";
import { indexLookupRequest } from "../src/route.js";
import { cacheApiIndexStore, memoryIndexStore } from "../src/store.js";

const DAY = 24 * 60 * 60 * 1000;
const ORIGIN = "https://index.test";
const VERSION = "idx-20261017-aaaaaaaa";
const NEXT = "idx-20261018-bbbbbbbb";
const fixture = readFileSync(
  new URL("../../index-builder/fixtures/employer-hub-sample.csv", import.meta.url),
  "utf8",
);
const built = buildIndex(fixture, VERSION);

type Route = { status: number; body: string; responseUrl?: string; throw?: boolean };
type Store = ReturnType<typeof memoryIndexStore>;

test("the published index origin is the dev CloudFront host", () => {
  assert.equal(INDEX_BASE, "https://d24ktdd0rusd1i.cloudfront.net");
});

test("an http index base is rejected", () => {
  assert.throws(
    () => createIndexClient({ baseUrl: "http://index.test", store: memoryIndexStore() }),
    /https origin/,
  );
});

test("content messages name the company to look up", () => {
  assert.equal(
    indexLookupRequest({ origin: "content", operation: "index-lookup", companyName: "Google LLC" }),
    "Google LLC",
  );
  assert.equal(indexLookupRequest({ origin: "popup", operation: "index-lookup", companyName: "Google" }), null);
  assert.equal(indexLookupRequest({ origin: "content", operation: "request", companyName: "Google" }), null);
  assert.equal(indexLookupRequest(null), null);
});

forEachStore("a known employer comes back with filings and a rank band", async (store) => {
  const world = worldFor(store);
  const result = await world.client.lookup("GOOGLE LLC");
  assert.equal(result.match, "matched");
  if (result.match !== "matched") return;
  assert.equal(result.company.key, "google");
  assert.equal(result.company.displayName, "GOOGLE LLC");
  assert.equal(result.company.likelihood, "frequent");
  assert.equal(result.rankBand, "top");
  assert.deepEqual(
    result.company.records.map((record) => [record.fiscalYear, record.initialApprovals]),
    [
      [2023, 80],
      [2024, 105],
    ],
  );
  assert.deepEqual(companyVerdict(result.company), {
    match: "matched",
    companyId: "google",
    likelihood: "frequent",
  });
});

forEachStore("a quoted employer name keeps its comma", async (store) => {
  const world = worldFor(store);
  const result = await world.client.lookup("2K VEGAS, INC.");
  assert.equal(result.match, "matched");
  if (result.match !== "matched") return;
  assert.equal(result.company.displayName, "2K VEGAS, INC.");
  assert.deepEqual(result.company.records, [
    {
      fiscalYear: 2024,
      initialApprovals: 4,
      initialDenials: 1,
      continuingApprovals: 10,
      continuingDenials: 0,
    },
  ]);
});

forEachStore("a longer board name matches the shorter index key in one shard fetch", async (store) => {
  const world = worldFor(store);
  const result = await world.client.lookup("Google LLC International Holdings");
  assert.equal(result.match, "matched");
  if (result.match !== "matched") return;
  assert.equal(result.company.key, "google");
  assert.equal(world.calls.filter((url) => url.endsWith(".json") && !url.endsWith("current.json")).length, 1);
});

forEachStore("a different tail in the same shard is a miss and does not fetch again", async (store) => {
  const world = worldFor(store);
  const hit = await world.client.lookup("Acme Labs");
  assert.equal(hit.match, "matched");
  const callsAfterHit = world.calls.length;
  const miss = await world.client.lookup("Acme Widgets");
  assert.deepEqual(miss, { match: "unmatched", companyId: null, likelihood: "unknown" });
  assert.equal(world.calls.length, callsAfterHit);
});

forEachStore("punctuation with no name does not fetch", async (store) => {
  const world = worldFor(store);
  const result = await world.client.lookup("!!!");
  assert.deepEqual(result, { match: "unmatched", companyId: null, likelihood: "unknown" });
  assert.deepEqual(world.calls, []);
});

forEachStore("the pointer is fetched at most once per 24 hours", async (store) => {
  const world = worldFor(store);
  await world.client.lookup("Google LLC");
  await world.client.lookup("The Google LLC");
  assert.equal(pointerCalls(world.calls), 1);
  world.at(DAY - 1);
  await world.client.lookup("Google LLC");
  assert.equal(pointerCalls(world.calls), 1);
  world.at(DAY);
  await world.client.lookup("Google LLC");
  assert.equal(pointerCalls(world.calls), 2);
});

forEachStore("concurrent lookups share one pointer fetch and one shard fetch", async (store) => {
  const world = worldFor(store);
  const [first, second] = await Promise.all([
    world.client.lookup("Google LLC"),
    world.client.lookup("Google, Inc."),
  ]);
  assert.equal(first.match, "matched");
  assert.equal(second.match, "matched");
  assert.equal(pointerCalls(world.calls), 1);
  assert.equal(shardCalls(world.calls), 1);
});

forEachStore("a new index version drops the previous shard", async (store) => {
  const world = worldFor(store);
  assert.equal((await world.client.lookup("Google LLC")).match, "matched");
  world.at(DAY);
  world.routes.set(pointerUrl(), { status: 200, body: pointerBody(NEXT) });
  world.routes.set(shardUrl(NEXT, "GOOGLE LLC"), {
    status: 200,
    body: shardJson({ indexVersion: NEXT, normalizerVersion: 1, entries: {} }),
  });
  const result = await world.client.lookup("Google LLC");
  assert.deepEqual(result, { match: "unmatched", companyId: null, likelihood: "unknown" });
  assert.equal(world.calls.includes(shardUrl(NEXT, "GOOGLE LLC")), true);
});

forEachStore("a mismatched normalizer keeps the last compatible index for 24 hours", async (store) => {
  const world = worldFor(store);
  assert.equal((await world.client.lookup("Google LLC")).match, "matched");
  world.at(DAY);
  world.routes.set(pointerUrl(), { status: 200, body: pointerBody(NEXT, 2) });
  const kept = await world.client.lookup("Google LLC");
  assert.equal(kept.match, "matched");
  if (kept.match === "matched") assert.equal(kept.company.key, "google");
  const callsAfterReject = pointerCalls(world.calls);
  world.at(DAY + 60_000);
  await world.client.lookup("Google LLC");
  assert.equal(pointerCalls(world.calls), callsAfterReject);
  assert.equal(world.calls.includes(shardUrl(NEXT, "GOOGLE LLC")), false);
});

forEachStore("a failed pointer fetch keeps the last index and waits 24 hours", async (store) => {
  const world = worldFor(store);
  assert.equal((await world.client.lookup("Google LLC")).match, "matched");
  world.at(DAY);
  world.routes.set(pointerUrl(), { status: 200, body: "", throw: true });
  assert.equal((await world.client.lookup("Google LLC")).match, "matched");
  world.at(DAY + 1);
  await world.client.lookup("Google LLC");
  assert.equal(pointerCalls(world.calls), 2);
  world.at(DAY * 2);
  world.routes.set(pointerUrl(), { status: 200, body: pointerBody(VERSION) });
  assert.equal((await world.client.lookup("Google LLC")).match, "matched");
  assert.equal(pointerCalls(world.calls), 3);
});

forEachStore("a pointer that redirects off the index origin is not used", async (store) => {
  const world = worldFor(store);
  world.routes.set(pointerUrl(), {
    status: 200,
    body: pointerBody(VERSION),
    responseUrl: "https://evil.example/v1/index/current.json",
  });
  const result = await world.client.lookup("Google LLC");
  assert.deepEqual(result, { match: "unmatched", companyId: null, likelihood: "unknown" });
  assert.equal(shardCalls(world.calls), 0);
});

forEachStore("a shard from another index version is fetched again", async (store) => {
  const world = worldFor(store);
  const url = shardUrl(VERSION, "GOOGLE LLC");
  const published = JSON.parse(world.routes.get(url)?.body ?? "{}") as { indexVersion: string };
  published.indexVersion = NEXT;
  world.routes.set(url, { status: 200, body: JSON.stringify(published) });
  assert.deepEqual(await world.client.lookup("Google LLC"), {
    match: "unmatched",
    companyId: null,
    likelihood: "unknown",
  });
  assert.deepEqual(await world.client.lookup("Google LLC"), {
    match: "unmatched",
    companyId: null,
    likelihood: "unknown",
  });
  assert.equal(world.calls.filter((call) => call === url).length, 2);
});

function forEachStore(name: string, run: (store: Store) => Promise<void>) {
  test(`${name}, memory store`, () => run(memoryIndexStore()));
  test(`${name}, cache store`, () => run(cacheApiIndexStore(fakeCaches())));
}

function worldFor(store: Store) {
  const routes = new Map<string, Route>();
  routes.set(pointerUrl(), { status: 200, body: pointerBody(VERSION) });
  const names = ["GOOGLE LLC", "2K VEGAS, INC.", "ACME LABS", "ACME ROBOTICS LABS"];
  for (const name of names) {
    const file = built.shards[shardIndex(normalizeCompanyName(name))];
    if (file === undefined) throw new Error(`missing shard for ${name}`);
    routes.set(shardUrl(VERSION, name), { status: 200, body: shardJson(file) });
  }
  const calls: string[] = [];
  let time = 0;
  const client = createIndexClient({
    baseUrl: ORIGIN,
    store,
    fetch: async (url: string) => {
      calls.push(url);
      const route = routes.get(url);
      if (route === undefined) return { ok: false, url, text: async () => "" };
      if (route.throw) throw new Error("offline");
      return {
        ok: route.status === 200,
        url: route.responseUrl ?? url,
        text: async () => route.body,
      };
    },
    now: () => time,
  });
  return {
    client,
    calls,
    routes,
    at(ms: number) {
      time = ms;
    },
  };
}

function pointerBody(indexVersion: string, normalizerVersion = 1): string {
  return JSON.stringify({
    indexVersion,
    normalizerVersion,
    shardCount: 256,
    shardKeyPrefix: `v1/index/${indexVersion}/`,
    builtAt: "2026-10-17T00:00:00.000Z",
    fiscalYears: [2023, 2024],
  });
}

function pointerUrl(): string {
  return `${ORIGIN}/v1/index/current.json`;
}

function shardUrl(indexVersion: string, employer: string): string {
  return `${ORIGIN}/v1/index/${indexVersion}/${shardIndex(normalizeCompanyName(employer))}.json`;
}

function pointerCalls(calls: readonly string[]): number {
  return calls.filter((url) => url === pointerUrl()).length;
}

function shardCalls(calls: readonly string[]): number {
  return calls.filter((url) => url !== pointerUrl()).length;
}

function fakeCaches() {
  const saved = new Map<string, string>();
  const cache = {
    async match(url: string) {
      const body = saved.get(url);
      if (body === undefined) return undefined;
      return new Response(body);
    },
    async put(url: string, response: Response) {
      saved.set(url, await response.text());
    },
    async delete(request: string | { url: string }) {
      const url = typeof request === "string" ? request : request.url;
      return saved.delete(url);
    },
    async keys() {
      return [...saved.keys()].map((url) => ({ url }));
    },
  };
  return { async open() { return cache; } };
}
