import assert from "node:assert/strict";
import test from "node:test";
import type { SlotName } from "@visaspotter/domain";
import { parseUtcDay } from "../src/day.ts";
import {
  classifySlot,
  readAggregateRequest,
  rollupDay,
  type HealthCounters,
  type HealthRow,
  type LayoutHealth,
} from "../src/health.ts";
import { handleReport } from "../src/report.ts";

const NOW = new Date("2026-10-18T03:00:00.000Z");
const NOW_ISO = NOW.toISOString();
const DAY = mustDay("2026-10-18");

function mustDay(value: string) {
  const day = parseUtcDay(value);
  assert.ok(day, value);
  return day;
}

function counters(reports: number, misses: number, hits: HealthCounters["hits"] = {}): HealthCounters {
  return { reports, misses, hits };
}

function row(options: {
  platform?: HealthRow["platform"];
  pageKind?: HealthRow["pageKind"];
  packVersion?: number;
  slot?: SlotName;
  reports: number;
  misses: number;
  hits?: HealthCounters["hits"];
}): HealthRow {
  return {
    platform: options.platform ?? "linkedin",
    pageKind: options.pageKind ?? "search",
    packVersion: options.packVersion ?? 12,
    slot: options.slot ?? "jobTitle",
    counters: counters(options.reports, options.misses, options.hits),
  };
}

function post(body: unknown, overrides: Record<string, unknown> = {}) {
  return {
    version: "2.0",
    rawPath: "/v1/reports/selector-health",
    isBase64Encoded: false,
    body: typeof body === "string" ? body : JSON.stringify(body),
    requestContext: { http: { method: "POST" } },
    ...overrides,
  };
}

const validReport = {
  extVersion: "1.10.0",
  platform: "linkedin",
  pageKind: "search",
  packVersion: 12,
  slots: { jobTitle: -1, companyName: 1 },
};

test("a slot with fewer than 20 reports stays insufficient-data", () => {
  assert.equal(classifySlot(counters(19, 19)), "insufficient-data");
});

test("a miss rate above half of at least 20 reports is broken", () => {
  assert.equal(classifySlot(counters(20, 11, { 1: 9 })), "broken");
  assert.equal(classifySlot(counters(20, 10, { 0: 10 })), "ok");
});

test("a fallback selector that beats the primary is degraded", () => {
  assert.equal(classifySlot(counters(20, 0, { 0: 9, 2: 11 })), "degraded");
  assert.equal(classifySlot(counters(20, 0, { 0: 10, 1: 10 })), "ok");
  assert.equal(classifySlot(counters(20, 0, { 0: 15, 1: 5 })), "ok");
});

test("rollup keeps the worst slot and alerts only when a platform turns broken", () => {
  const rolled = rollupDay({
    day: DAY,
    now: NOW_ISO,
    alertsEnabled: false,
    previous: { indeed: "broken" },
    rows: [
      row({ packVersion: 1, reports: 100, misses: 0, hits: { 0: 100 }, slot: "jobTitle" }),
      row({ packVersion: 2, reports: 30, misses: 30, slot: "companyName" }),
      row({ platform: "indeed", reports: 20, misses: 20, slot: "description" }),
    ],
  });
  const linkedin = rolled.layouts.find((layout) => layout.platform === "linkedin");
  const indeed = rolled.layouts.find((layout) => layout.platform === "indeed");
  assert.ok(linkedin);
  assert.ok(indeed);
  assert.equal(linkedin.status, "broken");
  assert.equal(linkedin.packVersion, 1);
  assert.deepEqual(linkedin.brokenSlots, ["search#companyName#2"]);
  assert.equal(linkedin.pk, "LAYOUT#linkedin");
  assert.equal(linkedin.sk, DAY);
  assert.equal(indeed.status, "broken");
  assert.equal(rolled.alerts.length, 1);
  const alert = rolled.alerts[0];
  assert.ok(alert);
  assert.equal(alert.pk, "ALERT#layout");
  assert.equal(alert.sk, "linkedin#2026-10-18");
  assert.equal(alert.status, "suppressed");
  assert.equal(alert.reason, "alerts-disabled");
  assert.equal(alert.ttl, Math.floor(Date.parse(NOW_ISO) / 1000) + 365 * 24 * 60 * 60);
  assert.equal(linkedin.ttl, Math.floor(Date.parse(NOW_ISO) / 1000) + 180 * 24 * 60 * 60);
});

test("a platform that is already broken does not alert again", () => {
  const rolled = rollupDay({
    day: DAY,
    now: NOW_ISO,
    alertsEnabled: true,
    previous: { linkedin: "broken" },
    rows: [row({ reports: 20, misses: 20 })],
  });
  assert.equal(rolled.layouts.find((layout) => layout.platform === "linkedin")?.status, "broken");
  assert.equal(rolled.alerts.length, 0);
});

test("an enabled alert flag still writes a suppressed ses-not-wired row", () => {
  const rolled = rollupDay({
    day: DAY,
    now: NOW_ISO,
    alertsEnabled: true,
    previous: {},
    rows: [row({ reports: 20, misses: 20 })],
  });
  assert.equal(rolled.alerts[0]?.reason, "ses-not-wired");
  assert.equal(rolled.alerts[0]?.status, "suppressed");
});

test("no reports write insufficient-data for both platforms and no alert", () => {
  const rolled = rollupDay({
    day: DAY,
    now: NOW_ISO,
    alertsEnabled: false,
    previous: {},
    rows: [],
  });
  assert.deepEqual(
    rolled.layouts.map((layout) => layout.status),
    ["insufficient-data", "insufficient-data"] satisfies LayoutHealth[],
  );
  assert.deepEqual(
    rolled.layouts.map((layout) => layout.packVersion),
    [0, 0],
  );
  assert.equal(rolled.alerts.length, 0);
});

test("the same counters roll up to the same layout twice", () => {
  const input = {
    day: DAY,
    now: NOW_ISO,
    alertsEnabled: false,
    previous: {},
    rows: [row({ reports: 20, misses: 20 })],
  };
  assert.deepEqual(rollupDay(input), rollupDay(input));
});

test("aggregate defaults to yesterday and rejects a bad day", () => {
  const scheduled = readAggregateRequest({ mode: "aggregate" }, NOW);
  assert.equal(scheduled.ok && scheduled.day, "2026-10-17");
  const chosen = readAggregateRequest({ day: "2026-10-01" }, NOW);
  assert.equal(chosen.ok && chosen.day, "2026-10-01");
  assert.deepEqual(readAggregateRequest({ mode: "watch" }, NOW), { ok: false, error: "bad-mode" });
  assert.deepEqual(readAggregateRequest({ day: "2026-02-31" }, NOW), { ok: false, error: "bad-day" });
});

test("a selector report becomes one counter update per slot on today's key", () => {
  const decision = handleReport(post(validReport), NOW);
  assert.equal(decision.statusCode, 204);
  if (decision.statusCode !== 204) return;
  assert.equal(decision.updates.length, 2);
  assert.equal(decision.updates[0]?.pk, "HEALTH#2026-10-18");
  assert.equal(decision.updates[0]?.sk, "linkedin#search#12#jobTitle");
  assert.equal(decision.updates[0]?.outcome, "miss");
  assert.equal(decision.updates[1]?.sk, "linkedin#search#12#companyName");
  assert.deepEqual(decision.updates[1], {
    pk: "HEALTH#2026-10-18",
    sk: "linkedin#search#12#companyName",
    ttl: Math.floor(Date.parse(NOW_ISO) / 1000) + 30 * 24 * 60 * 60,
    outcome: "hit",
    index: 1,
  });
});

test("a payload 1.0 report is accepted", () => {
  const decision = handleReport(
    {
      httpMethod: "POST",
      path: "/v1/reports/selector-health",
      body: JSON.stringify(validReport),
      isBase64Encoded: false,
    },
    NOW,
  );
  assert.equal(decision.statusCode, 204);
});

test("a base64 report body is accepted", () => {
  const body = JSON.stringify(validReport);
  const decision = handleReport(
    post(body, { isBase64Encoded: true, body: Buffer.from(body).toString("base64") }),
    NOW,
  );
  assert.equal(decision.statusCode, 204);
});

test("report validation rejects unknown slots, bad hits, long strings, and the wrong route", () => {
  assert.equal(handleReport(post({ ...validReport, platform: "glassdoor" }), NOW).statusCode, 400);
  assert.equal(
    handleReport(post({ ...validReport, slots: { notASlot: 0 } }), NOW).statusCode,
    400,
  );
  assert.equal(handleReport(post({ ...validReport, slots: { jobTitle: 8 } }), NOW).statusCode, 400);
  assert.equal(handleReport(post({ ...validReport, slots: { jobTitle: 1.5 } }), NOW).statusCode, 400);
  assert.equal(
    handleReport(post({ ...validReport, extVersion: "x".repeat(201) }), NOW).statusCode,
    400,
  );
  assert.equal(handleReport(post("{}", { rawPath: "/v1/reports/unmatched" }), NOW).statusCode, 404);
  assert.equal(
    handleReport(post(validReport, { requestContext: { http: { method: "GET" } } }), NOW).statusCode,
    405,
  );
  const oversized = handleReport(post("x".repeat(4097)), NOW);
  assert.equal(oversized.statusCode, 413);
});
