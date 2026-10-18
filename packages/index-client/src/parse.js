import { NORMALIZER_VERSION } from "../../domain/src/normalize.js";
import { SHARD_COUNT } from "../../domain/src/shard.js";

const INDEX_VERSION = /^idx-[0-9]{8}-[0-9a-f]{8}$/;
const COMPANY_KEY = /^[a-z0-9]+(?: [a-z0-9]+)*$/;
const YEAR_KEY = /^[0-9]{4}$/;
const LIKELIHOODS = new Set(["frequent", "occasional", "rare", "none"]);
const RANK_BANDS = new Set(["top", "mid", "none"]);
const MAX_COUNT = 10_000_000;

export function parsePointer(value) {
  if (!isRecord(value)) return null;
  const indexVersion = value.indexVersion;
  if (typeof indexVersion !== "string" || !INDEX_VERSION.test(indexVersion)) return null;
  if (value.normalizerVersion !== NORMALIZER_VERSION) return null;
  if (value.shardCount !== SHARD_COUNT) return null;
  if (value.shardKeyPrefix !== `v1/index/${indexVersion}/`) return null;
  if (typeof value.builtAt !== "string" || value.builtAt.length === 0) return null;
  if (!Array.isArray(value.fiscalYears) || value.fiscalYears.length === 0) return null;
  const fiscalYears = [];
  for (const year of value.fiscalYears) {
    if (!Number.isInteger(year)) return null;
    fiscalYears.push(year);
  }
  return {
    indexVersion,
    normalizerVersion: value.normalizerVersion,
    shardCount: value.shardCount,
    shardKeyPrefix: value.shardKeyPrefix,
    builtAt: value.builtAt,
    fiscalYears,
  };
}

export function parseShard(value, indexVersion) {
  if (!isRecord(value)) return null;
  if (value.indexVersion !== indexVersion) return null;
  if (value.normalizerVersion !== NORMALIZER_VERSION) return null;
  if (!isRecord(value.entries)) return null;
  const entries = new Map();
  for (const [key, raw] of Object.entries(value.entries)) {
    if (!COMPANY_KEY.test(key)) continue;
    const entry = parseEntry(raw);
    if (entry !== null) entries.set(key, entry);
  }
  return { indexVersion, entries };
}

export function findEntry(entries, key) {
  const tokens = key.split(" ");
  while (tokens.length > 0) {
    const candidate = tokens.join(" ");
    const entry = entries.get(candidate);
    if (entry !== undefined) return { key: candidate, entry };
    tokens.pop();
  }
  return null;
}

export function matched(key, entry) {
  return {
    match: "matched",
    company: {
      key,
      displayName: entry.n,
      likelihood: entry.l,
      records: entry.records.map((record) => ({ ...record })),
    },
    rankBand: entry.rankBand,
  };
}

export function unmatched() {
  return { match: "unmatched", companyId: null, likelihood: "unknown" };
}

function parseEntry(raw) {
  if (!isRecord(raw)) return null;
  if (typeof raw.n !== "string" || raw.n.length === 0 || raw.n.length > 500) return null;
  if (!LIKELIHOODS.has(raw.l)) return null;
  if (!RANK_BANDS.has(raw.rankBand)) return null;
  if (!isRecord(raw.y)) return null;
  const records = [];
  for (const year of Object.keys(raw.y).sort()) {
    if (!YEAR_KEY.test(year)) return null;
    const record = yearRecord(Number(year), raw.y[year]);
    if (record === null) return null;
    records.push(record);
  }
  if (records.length === 0) return null;
  return { n: raw.n, l: raw.l, rankBand: raw.rankBand, records };
}

function yearRecord(fiscalYear, counts) {
  if (!isRecord(counts)) return null;
  const initialApprovals = count(counts.ia);
  const initialDenials = count(counts.id);
  const continuingApprovals = count(counts.ca);
  const continuingDenials = count(counts.cd);
  if (
    initialApprovals === null ||
    initialDenials === null ||
    continuingApprovals === null ||
    continuingDenials === null
  ) {
    return null;
  }
  return { fiscalYear, initialApprovals, initialDenials, continuingApprovals, continuingDenials };
}

function count(value) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_COUNT) return null;
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
