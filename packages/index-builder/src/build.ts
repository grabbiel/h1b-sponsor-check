import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeLikelihood,
  normalizeCompanyName,
  NORMALIZER_VERSION,
  type Company,
  type KnownLikelihood,
  type SponsorRecord,
} from "@visaspotter/domain";
import { parseHubCsv, type HubRow } from "./csv.ts";

export const SHARD_COUNT = 256;
export const FISCAL_YEARS_KEPT = 5;

export type ShardEntry = {
  n: string;
  l: KnownLikelihood;
  y: Record<string, [number, number, number, number]>;
};

export type ShardFile = {
  indexVersion: string;
  normalizerVersion: number;
  entries: Record<string, ShardEntry>;
};

export type SizeReport = {
  distinctEmployers: number;
  nonemptyShards: number;
  gzipP50: number;
  gzipP99: number;
  gzipMax: number;
};

export function fnv1a32(text: string): number {
  const bytes = Buffer.from(text, "utf8");
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function shardIndex(key: string): number {
  const token = key.split(" ")[0] ?? "";
  return fnv1a32(token) % SHARD_COUNT;
}

export function percentileNearestRank(sortedAsc: readonly number[], percentile: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((percentile / 100) * sortedAsc.length);
  const index = Math.min(sortedAsc.length, Math.max(1, rank)) - 1;
  return sortedAsc[index] ?? 0;
}

export function companiesFromHubRows(rows: readonly HubRow[]): Company[] {
  const years = [...new Set(rows.map((row) => row.fiscalYear))].sort((a, b) => b - a);
  const keptYears = new Set(years.slice(0, FISCAL_YEARS_KEPT));
  const grouped = new Map<string, { display: Map<string, number>; first: Map<string, number>; years: Map<number, SponsorRecord> }>();

  rows.forEach((row, index) => {
    if (!keptYears.has(row.fiscalYear)) return;
    const employer = row.employer.trim();
    if (employer.length === 0) return;
    const key = normalizeCompanyName(employer);
    if (key.length === 0) return;
    let group = grouped.get(key);
    if (group === undefined) {
      group = { display: new Map(), first: new Map(), years: new Map() };
      grouped.set(key, group);
    }
    group.display.set(employer, (group.display.get(employer) ?? 0) + 1);
    if (!group.first.has(employer)) group.first.set(employer, index);
    const prior = group.years.get(row.fiscalYear) ?? emptyRecord(row.fiscalYear);
    prior.initialApprovals += row.initialApprovals;
    prior.initialDenials += row.initialDenials;
    prior.continuingApprovals += row.continuingApprovals;
    prior.continuingDenials += row.continuingDenials;
    group.years.set(row.fiscalYear, prior);
  });

  return [...grouped.entries()]
    .map(([key, group]) => {
      const records = [...group.years.values()].sort((a, b) => a.fiscalYear - b.fiscalYear);
      return {
        key: normalizeCompanyName(key),
        displayName: displayName(group.display, group.first),
        likelihood: computeLikelihood(records),
        records,
      };
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function buildShards(companies: readonly Company[], indexVersion: string): ShardFile[] {
  const shards: ShardFile[] = Array.from({ length: SHARD_COUNT }, () => ({
    indexVersion,
    normalizerVersion: NORMALIZER_VERSION,
    entries: {},
  }));
  for (const company of companies) {
    const shard = shards[shardIndex(company.key)];
    if (shard === undefined) continue;
    const years: ShardEntry["y"] = {};
    for (const record of company.records) {
      years[String(record.fiscalYear)] = [
        record.initialApprovals,
        record.initialDenials,
        record.continuingApprovals,
        record.continuingDenials,
      ];
    }
    shard.entries[company.key] = { n: company.displayName, l: company.likelihood, y: years };
  }
  return shards;
}

export function shardJson(shard: ShardFile): string {
  const entries: ShardFile["entries"] = {};
  for (const key of Object.keys(shard.entries).sort()) {
    const entry = shard.entries[key];
    if (entry === undefined) continue;
    const years: ShardEntry["y"] = {};
    for (const year of Object.keys(entry.y).sort()) {
      const tuple = entry.y[year];
      if (tuple !== undefined) years[year] = tuple;
    }
    entries[key] = { n: entry.n, l: entry.l, y: years };
  }
  return JSON.stringify({
    indexVersion: shard.indexVersion,
    normalizerVersion: shard.normalizerVersion,
    entries,
  });
}

export function sizeReport(companies: readonly Company[], shards: readonly ShardFile[]): SizeReport {
  const sizes = shards
    .filter((shard) => Object.keys(shard.entries).length > 0)
    .map((shard) => gzipSync(Buffer.from(shardJson(shard))).length)
    .sort((a, b) => a - b);
  return {
    distinctEmployers: companies.length,
    nonemptyShards: sizes.length,
    gzipP50: percentileNearestRank(sizes, 50),
    gzipP99: percentileNearestRank(sizes, 99),
    gzipMax: sizes.at(-1) ?? 0,
  };
}

export function formatReport(report: SizeReport): string {
  return [
    `distinct employers: ${report.distinctEmployers}`,
    `nonempty shards: ${report.nonemptyShards}`,
    `gzip bytes p50: ${report.gzipP50}`,
    `gzip bytes p99: ${report.gzipP99}`,
    `gzip bytes max: ${report.gzipMax}`,
  ].join("\n");
}

export function buildIndex(csvText: string, indexVersion: string): { companies: Company[]; shards: ShardFile[]; report: SizeReport } {
  const companies = companiesFromHubRows(parseHubCsv(csvText));
  const shards = buildShards(companies, indexVersion);
  return { companies, shards, report: sizeReport(companies, shards) };
}

export function writeShards(dir: string, shards: readonly ShardFile[]): void {
  mkdirSync(dir, { recursive: true });
  shards.forEach((shard, index) => {
    writeFileSync(join(dir, `${index}.json`), shardJson(shard));
  });
}

function emptyRecord(fiscalYear: number): SponsorRecord {
  return {
    fiscalYear,
    initialApprovals: 0,
    initialDenials: 0,
    continuingApprovals: 0,
    continuingDenials: 0,
  };
}

function displayName(counts: Map<string, number>, firstSeen: Map<string, number>): string {
  let best = "";
  let bestCount = -1;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const [name, count] of counts) {
    const index = firstSeen.get(name) ?? Number.POSITIVE_INFINITY;
    if (count > bestCount || (count === bestCount && index < bestIndex)) {
      best = name;
      bestCount = count;
      bestIndex = index;
    }
  }
  return best;
}
