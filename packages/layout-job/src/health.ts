import type { PageKind, Platform, SlotName } from "@visaspotter/domain";
import { parseUtcDay, previousUtcDay, ttlSeconds, yesterday, type UtcDay } from "./day.ts";
import { ALERT_LAYOUT_PK, LAYOUT_PK_PREFIX } from "./keys.ts";

const HIT_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export type HitIndex = (typeof HIT_INDEXES)[number];

export const PLATFORMS = ["linkedin", "indeed"] as const satisfies readonly Platform[];

const MIN_REPORTS = 20;
const HEALTH_TTL_DAYS = 30;
const LAYOUT_TTL_DAYS = 180;
const ALERT_TTL_DAYS = 365;

export type LayoutHealth = "ok" | "degraded" | "broken" | "insufficient-data";

export type HealthCounters = {
  reports: number;
  misses: number;
  hits: Partial<Record<HitIndex, number>>;
};

export type HealthRow = {
  platform: Platform;
  pageKind: PageKind;
  packVersion: number;
  slot: SlotName;
  counters: HealthCounters;
};

export type LayoutStatusItem = {
  pk: string;
  sk: UtcDay;
  kind: "layout-status";
  platform: Platform;
  status: LayoutHealth;
  brokenSlots: string[];
  packVersion: number;
  at: string;
  ttl: number;
};

export type LayoutAlertItem = {
  pk: typeof ALERT_LAYOUT_PK;
  sk: string;
  kind: "alert-log";
  status: "suppressed";
  reason: "alerts-disabled" | "ses-not-wired";
  platform: Platform;
  day: UtcDay;
  at: string;
  ttl: number;
};

export type HealthUpdate = {
  pk: string;
  sk: string;
  ttl: number;
} & ({ outcome: "miss" } | { outcome: "hit"; index: HitIndex });

const SEVERITY: Record<LayoutHealth, number> = {
  "insufficient-data": 0,
  ok: 1,
  degraded: 2,
  broken: 3,
};

export function isHitIndex(value: number): value is HitIndex {
  return HIT_INDEXES.some((index) => index === value);
}

export function classifySlot(counters: HealthCounters): LayoutHealth {
  if (counters.reports < MIN_REPORTS) return "insufficient-data";
  if (counters.misses / counters.reports > 0.5) return "broken";
  const primary = counters.hits[0] ?? 0;
  let fallback = 0;
  for (const index of HIT_INDEXES) {
    if (index === 0) continue;
    const count = counters.hits[index] ?? 0;
    if (count > fallback) fallback = count;
  }
  if (fallback > primary) return "degraded";
  return "ok";
}

export function healthTtl(nowIso: string): number {
  return ttlSeconds(nowIso, HEALTH_TTL_DAYS);
}

export function rollupDay(input: {
  day: UtcDay;
  rows: readonly HealthRow[];
  previous: Partial<Record<Platform, LayoutHealth>>;
  now: string;
  alertsEnabled: boolean;
}): { layouts: LayoutStatusItem[]; alerts: LayoutAlertItem[] } {
  const layouts: LayoutStatusItem[] = [];
  const alerts: LayoutAlertItem[] = [];
  for (const platform of PLATFORMS) {
    const rows = input.rows.filter((row) => row.platform === platform);
    const status = rows.reduce<LayoutHealth>(
      (worst, row) => worse(worst, classifySlot(row.counters)),
      "insufficient-data",
    );
    const layout: LayoutStatusItem = {
      pk: `${LAYOUT_PK_PREFIX}${platform}`,
      sk: input.day,
      kind: "layout-status",
      platform,
      status,
      brokenSlots: brokenSlots(rows),
      packVersion: dominantPack(rows),
      at: input.now,
      ttl: ttlSeconds(input.now, LAYOUT_TTL_DAYS),
    };
    layouts.push(layout);
    if (status === "broken" && input.previous[platform] !== "broken") {
      alerts.push({
        pk: ALERT_LAYOUT_PK,
        sk: `${platform}#${input.day}`,
        kind: "alert-log",
        status: "suppressed",
        reason: input.alertsEnabled ? "ses-not-wired" : "alerts-disabled",
        platform,
        day: input.day,
        at: input.now,
        ttl: ttlSeconds(input.now, ALERT_TTL_DAYS),
      });
    }
  }
  return { layouts, alerts };
}

export type AggregateRequest =
  | { ok: true; day: UtcDay }
  | { ok: false; error: "bad-mode" | "bad-day" };

export function readAggregateRequest(event: unknown, now: Date): AggregateRequest {
  if (!isRecord(event)) return { ok: false, error: "bad-mode" };
  if (Object.keys(event).some((key) => key !== "mode" && key !== "day")) {
    return { ok: false, error: "bad-mode" };
  }
  if ("mode" in event && event.mode !== "aggregate") return { ok: false, error: "bad-mode" };
  if (!("day" in event) || event.day === undefined) return { ok: true, day: yesterday(now) };
  if (typeof event.day !== "string") return { ok: false, error: "bad-day" };
  const day = parseUtcDay(event.day);
  if (day === undefined) return { ok: false, error: "bad-day" };
  return { ok: true, day };
}

export function priorDay(day: UtcDay): UtcDay {
  return previousUtcDay(day);
}

function worse(left: LayoutHealth, right: LayoutHealth): LayoutHealth {
  return SEVERITY[left] >= SEVERITY[right] ? left : right;
}

function brokenSlots(rows: readonly HealthRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (classifySlot(row.counters) !== "broken") continue;
    names.push(`${row.pageKind}#${row.slot}#${row.packVersion}`);
  }
  return names.sort();
}

function dominantPack(rows: readonly HealthRow[]): number {
  const totals = new Map<number, number>();
  for (const row of rows) {
    totals.set(row.packVersion, (totals.get(row.packVersion) ?? 0) + row.counters.reports);
  }
  let bestVersion = 0;
  let bestReports = -1;
  for (const [version, reports] of totals) {
    if (reports > bestReports || (reports === bestReports && version > bestVersion)) {
      bestVersion = version;
      bestReports = reports;
    }
  }
  return bestVersion;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
