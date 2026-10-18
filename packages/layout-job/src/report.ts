import {
  normalizeCompanyName,
  PAGE_KINDS,
  SLOT_NAMES,
  type CompanyKey,
  type PageKind,
  type Platform,
  type SlotName,
} from "@visaspotter/domain";
import { ttlSeconds, utcDay, type UtcDay } from "./day.ts";
import { healthTtl, isHitIndex, type HealthUpdate, type HitIndex } from "./health.ts";
import { HEALTH_PK_PREFIX, REPORT_PATH, UNMATCHED_PATH, UNMATCHED_PK_PREFIX } from "./keys.ts";

const MAX_BYTES = 4096;
const MAX_TEXT = 200;
const MAX_NAMES = 20;
const UNMATCHED_TTL_DAYS = 90;

const REPORT_KEYS = new Set(["extVersion", "platform", "pageKind", "packVersion", "slots"]);

export type ReportError =
  | "invalid-json"
  | "invalid-request"
  | "invalid-report"
  | "body-too-large"
  | "unknown-platform"
  | "unknown-page"
  | "unknown-slot"
  | "invalid-hit";

export type UnmatchedUpdate = {
  pk: string;
  sk: CompanyKey;
  sampleRaw: string;
  at: string;
  ttl: number;
};

export type ReportResponse =
  | { statusCode: 204; kind: "health"; updates: HealthUpdate[] }
  | { statusCode: 204; kind: "unmatched"; updates: UnmatchedUpdate[] }
  | { statusCode: 400 | 413; error: ReportError }
  | { statusCode: 404; error: "not-found" }
  | { statusCode: 405; error: "method" };

export function handleReport(event: unknown, now: Date): ReportResponse {
  const http = readHttp(event);
  if (!http.ok) return reject(http.error);
  if (http.method !== "POST") return { statusCode: 405, error: "method" };
  if (http.path !== REPORT_PATH && http.path !== UNMATCHED_PATH) return { statusCode: 404, error: "not-found" };
  let json: unknown;
  try {
    json = JSON.parse(http.body);
  } catch {
    return reject("invalid-json");
  }
  const nowIso = now.toISOString();
  if (http.path === UNMATCHED_PATH) {
    const parsed = parseUnmatched(json, nowIso);
    if (!parsed.ok) return reject(parsed.error);
    return { statusCode: 204, kind: "unmatched", updates: parsed.updates };
  }
  const parsed = parseReport(json, utcDay(now), nowIso);
  if (!parsed.ok) return reject(parsed.error);
  return { statusCode: 204, kind: "health", updates: parsed.updates };
}

function reject(error: ReportError): ReportResponse {
  return { statusCode: error === "body-too-large" ? 413 : 400, error };
}

type HttpRead =
  | { ok: true; method: string; path: string; body: string }
  | { ok: false; error: ReportError };

function readHttp(event: unknown): HttpRead {
  if (!isRecord(event)) return { ok: false, error: "invalid-request" };
  const route = readRoute(event);
  if (route === undefined) return { ok: false, error: "invalid-request" };
  const encoded = event.body;
  if (encoded === undefined || encoded === null) return { ok: true, ...route, body: "" };
  if (typeof encoded !== "string") return { ok: false, error: "invalid-json" };
  const body = event.isBase64Encoded === true ? Buffer.from(encoded, "base64").toString("utf8") : encoded;
  if (Buffer.byteLength(body) > MAX_BYTES) return { ok: false, error: "body-too-large" };
  return { ok: true, ...route, body };
}

function readRoute(event: Record<string, unknown>): { method: string; path: string } | undefined {
  if (isRecord(event.requestContext)) {
    const http = event.requestContext.http;
    if (isRecord(http) && typeof http.method === "string" && typeof event.rawPath === "string") {
      return { method: http.method, path: event.rawPath };
    }
  }
  if (typeof event.httpMethod === "string" && typeof event.path === "string") {
    return { method: event.httpMethod, path: event.path };
  }
  return undefined;
}

function parseReport(
  input: unknown,
  day: UtcDay,
  nowIso: string,
): { ok: true; updates: HealthUpdate[] } | { ok: false; error: ReportError } {
  if (!isRecord(input) || Object.keys(input).some((key) => !REPORT_KEYS.has(key))) {
    return { ok: false, error: "invalid-report" };
  }
  if (typeof input.extVersion !== "string" || input.extVersion.length === 0 || input.extVersion.length > MAX_TEXT) {
    return { ok: false, error: "invalid-report" };
  }
  if (typeof input.platform !== "string" || !isPlatform(input.platform)) {
    return { ok: false, error: "unknown-platform" };
  }
  if (typeof input.pageKind !== "string" || !isPageKind(input.pageKind)) {
    return { ok: false, error: "unknown-page" };
  }
  if (typeof input.packVersion !== "number" || !Number.isInteger(input.packVersion) || input.packVersion < 1) {
    return { ok: false, error: "invalid-report" };
  }
  if (!isRecord(input.slots) || Object.keys(input.slots).length === 0) {
    return { ok: false, error: "invalid-report" };
  }
  if (Object.keys(input.slots).some((key) => !isSlotName(key))) {
    return { ok: false, error: "unknown-slot" };
  }
  const updates: HealthUpdate[] = [];
  const ttl = healthTtl(nowIso);
  for (const slot of SLOT_NAMES) {
    if (!Object.hasOwn(input.slots, slot)) continue;
    const observation = readObservation(input.slots[slot]);
    if (!observation.ok) return observation;
    const key = {
      pk: `${HEALTH_PK_PREFIX}${day}`,
      sk: `${input.platform}#${input.pageKind}#${input.packVersion}#${slot}`,
      ttl,
    };
    updates.push(observation.hit === "miss" ? { ...key, outcome: "miss" } : { ...key, outcome: "hit", index: observation.hit });
  }
  return { ok: true, updates };
}

function readObservation(value: unknown): { ok: true; hit: HitIndex | "miss" } | { ok: false; error: ReportError } {
  if (typeof value !== "number" || !Number.isInteger(value)) return { ok: false, error: "invalid-hit" };
  if (value === -1) return { ok: true, hit: "miss" };
  if (!isHitIndex(value)) return { ok: false, error: "invalid-hit" };
  return { ok: true, hit: value };
}

const UNMATCHED_KEYS = new Set(["platform", "names"]);

function parseUnmatched(
  input: unknown,
  nowIso: string,
): { ok: true; updates: UnmatchedUpdate[] } | { ok: false; error: ReportError } {
  if (!isRecord(input) || Object.keys(input).some((key) => !UNMATCHED_KEYS.has(key))) {
    return { ok: false, error: "invalid-report" };
  }
  if (typeof input.platform !== "string" || !isPlatform(input.platform)) {
    return { ok: false, error: "unknown-platform" };
  }
  if (!Array.isArray(input.names) || input.names.length === 0 || input.names.length > MAX_NAMES) {
    return { ok: false, error: "invalid-report" };
  }
  const updates: UnmatchedUpdate[] = [];
  const ttl = ttlSeconds(nowIso, UNMATCHED_TTL_DAYS);
  for (const name of input.names) {
    if (typeof name !== "string" || name.length === 0 || name.length > MAX_TEXT) {
      return { ok: false, error: "invalid-report" };
    }
    const key = normalizeCompanyName(name);
    if (key.length === 0) continue;
    updates.push({
      pk: `${UNMATCHED_PK_PREFIX}${input.platform}`,
      sk: key,
      sampleRaw: name,
      at: nowIso,
      ttl,
    });
  }
  return { ok: true, updates };
}

function isPlatform(value: string): value is Platform {
  return value === "linkedin" || value === "indeed";
}

function isPageKind(value: string): value is PageKind {
  return PAGE_KINDS.some((kind) => kind === value);
}

function isSlotName(value: string): value is SlotName {
  return SLOT_NAMES.some((slot) => slot === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
