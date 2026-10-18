import { createHash } from "node:crypto";
import { NORMALIZER_VERSION } from "@visaspotter/domain";
import {
  buildShards,
  companiesFromHubRows,
  FISCAL_YEARS_KEPT,
  shardJson,
  SHARD_COUNT,
} from "@visaspotter/index-builder";
import { parseHubCsv, type HubRow } from "@visaspotter/index-builder/csv";
import { HUB_HOSTS, HUB_PK, POINTER_KEYS, RAW_KEY_PREFIX, SHARD_KEY_PREFIX } from "./keys.ts";

const MAX_CSV_BYTES = 40 * 1024 * 1024;
const CHECK_TTL_SECONDS = 180 * 24 * 60 * 60;
const ALERT_TTL_SECONDS = 365 * 24 * 60 * 60;
const FILES_PAGE_PATH = "h-1b-employer-data-hub-files";

export type RawCsv = {
  fiscalYear: number;
  body: string;
};

export type StoredObject = {
  bucket: "raw" | "public";
  key: string;
  body: string;
  contentType: "text/csv" | "application/json";
  cacheControl: string;
};

export type DatasetCheck =
  | {
      pk: typeof HUB_PK;
      sk: string;
      kind: "dataset-check";
      status: "unchanged" | "changed";
      at: string;
      ttl: number;
    }
  | {
      pk: typeof HUB_PK;
      sk: string;
      kind: "dataset-check";
      status: "failed";
      error: string;
      at: string;
      ttl: number;
    };

export type DatasetSnapshot = {
  pk: typeof HUB_PK;
  sk: string;
  kind: "dataset-snapshot";
  fingerprint: string;
  indexVersion: string;
  checkedAt: string;
  filesJson: string;
};

export type AlertLog = {
  pk: string;
  sk: string;
  kind: "alert-log";
  status: "suppressed";
  reason: "alerts-disabled" | "ses-not-wired";
  at: string;
  ttl: number;
};

export type OpsItem = DatasetCheck | DatasetSnapshot | AlertLog;

export type StoredSnapshot = {
  indexVersion: string;
  checkedAt: string;
  filesJson: string;
};

export type DatasetPorts = {
  fetchText: (url: string) => Promise<{ status: number; body: string }>;
  getSnapshot: (fingerprint: string) => Promise<StoredSnapshot | undefined>;
  listRawCsv: () => Promise<RawCsv[]>;
  putObject: (object: StoredObject) => Promise<void>;
  putItem: (item: OpsItem) => Promise<void>;
};

export type DatasetEnv = {
  alertsEnabled: boolean;
  hubUrl: string;
  now: string;
};

export type DatasetResult =
  | { outcome: "unchanged"; fingerprint: string }
  | { outcome: "changed"; fingerprint: string; indexVersion: string }
  | { outcome: "needs-operator"; error: "dataset-needs-operator" }
  | { outcome: "failed"; error: string };

type HubLink = {
  fiscalYear: number;
  url: string;
};

type Publication =
  | { ok: true; indexVersion: string; objects: StoredObject[]; snapshot: DatasetSnapshot }
  | { ok: false; error: string };

export async function runDataset(
  event: unknown,
  ports: DatasetPorts,
  env: DatasetEnv,
): Promise<DatasetResult> {
  const mode = modeOf(event);
  if (mode === undefined) return fail(ports, env, "bad-mode");
  if (mode === "build") return publish(ports, env, await ports.listRawCsv(), "no-raw-csv");
  return watch(ports, env);
}

async function watch(ports: DatasetPorts, env: DatasetEnv): Promise<DatasetResult> {
  if (!isUscisHttps(env.hubUrl)) return fail(ports, env, "hub-host");
  const hub = await readText(ports, env.hubUrl, "hub-fetch");
  if ("error" in hub) return fail(ports, env, hub.error);
  if (hub.status !== 200) return fail(ports, env, `hub-http-${hub.status}`);

  let links = extractHubCsvLinks(hub.body, env.hubUrl);
  if (links.length === 0) {
    const filesPage = extractHubFilesPage(hub.body, env.hubUrl);
    if (filesPage === undefined) return needsOperator(ports, env);
    const page = await readText(ports, filesPage, "files-fetch");
    if ("error" in page) return fail(ports, env, page.error);
    if (page.status !== 200) return fail(ports, env, `files-http-${page.status}`);
    links = extractHubCsvLinks(page.body, filesPage);
  }

  const chosen = newestFiscalYears(links, FISCAL_YEARS_KEPT);
  if (chosen.length === 0) return needsOperator(ports, env);

  const files: RawCsv[] = [];
  for (const link of chosen) {
    const csv = await readText(ports, link.url, "csv-fetch");
    if ("error" in csv) return fail(ports, env, csv.error);
    if (csv.status !== 200) return fail(ports, env, `csv-http-${link.fiscalYear}-${csv.status}`);
    if (Buffer.byteLength(csv.body) > MAX_CSV_BYTES) return fail(ports, env, "csv-too-large");
    files.push({ fiscalYear: link.fiscalYear, body: csv.body });
  }
  return publish(ports, env, files, "no-csv");
}

async function publish(
  ports: DatasetPorts,
  env: DatasetEnv,
  files: readonly RawCsv[],
  emptyError: "no-raw-csv" | "no-csv",
): Promise<DatasetResult> {
  const unique = dedupeFiles(files);
  if (unique.length === 0) return fail(ports, env, emptyError);
  for (const file of unique) {
    if (Buffer.byteLength(file.body) > MAX_CSV_BYTES) return fail(ports, env, "csv-too-large");
  }
  const fingerprint = fingerprintOf(unique);
  const existing = await ports.getSnapshot(fingerprint);
  const restored = existing === undefined ? undefined : pointerFromSnapshot(existing);
  if (restored !== undefined) {
    await putPointers(ports, restored);
    await putCheck(ports, env, { status: "unchanged" });
    return { outcome: "unchanged", fingerprint };
  }
  const built = buildPublication(unique, env.now, fingerprint);
  if (!built.ok) return fail(ports, env, built.error);
  for (const object of built.objects) await ports.putObject(object);
  await ports.putItem(built.snapshot);
  await putCheck(ports, env, { status: "changed" });
  await putAlert(ports, env, "dataset-changed", fingerprint);
  return { outcome: "changed", fingerprint, indexVersion: built.indexVersion };
}

async function needsOperator(ports: DatasetPorts, env: DatasetEnv): Promise<DatasetResult> {
  await putCheck(ports, env, { status: "failed", error: "dataset-needs-operator" });
  await putAlert(ports, env, "dataset-needs-operator", "hub-no-csv");
  return { outcome: "needs-operator", error: "dataset-needs-operator" };
}

async function fail(ports: DatasetPorts, env: DatasetEnv, error: string): Promise<DatasetResult> {
  await putCheck(ports, env, { status: "failed", error });
  await putAlert(ports, env, "dataset-failed", error);
  return { outcome: "failed", error };
}

async function readText(
  ports: DatasetPorts,
  url: string,
  prefix: string,
): Promise<{ status: number; body: string } | { error: string }> {
  if (!isAllowedFetch(url)) return { error: `${prefix}-host` };
  try {
    return await ports.fetchText(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return { error: `${prefix}:${message}`.slice(0, 500) };
  }
}

function isAllowedFetch(url: string): boolean {
  if (!isUscisHttps(url)) return false;
  const path = new URL(url).pathname;
  if (path.includes(FILES_PAGE_PATH)) return true;
  if (/\/h1b_datahubexport-\d{4}\.csv$/i.test(path)) return true;
  return path.includes("/h-1b-employer-data-hub");
}

async function putCheck(
  ports: DatasetPorts,
  env: DatasetEnv,
  check: { status: "unchanged" | "changed" } | { status: "failed"; error: string },
): Promise<void> {
  const at = env.now;
  const base = {
    pk: HUB_PK,
    sk: `CHECK#${at}`,
    kind: "dataset-check" as const,
    at,
    ttl: epochSeconds(at) + CHECK_TTL_SECONDS,
  };
  if (check.status === "failed") {
    await ports.putItem({ ...base, status: "failed", error: check.error });
    return;
  }
  await ports.putItem({ ...base, status: check.status });
}

async function putAlert(
  ports: DatasetPorts,
  env: DatasetEnv,
  alertKind: string,
  dedupeKey: string,
): Promise<void> {
  const at = env.now;
  await ports.putItem({
    pk: `ALERT#${alertKind}`,
    sk: dedupeKey.slice(0, 200),
    kind: "alert-log",
    status: "suppressed",
    reason: env.alertsEnabled ? "ses-not-wired" : "alerts-disabled",
    at,
    ttl: epochSeconds(at) + ALERT_TTL_SECONDS,
  });
}

function buildPublication(files: readonly RawCsv[], at: string, fingerprint: string): Publication {
  const rows: HubRow[] = [];
  const parsedFiles: Array<{ fiscalYear: number; body: string; sha256: string; bytes: number }> = [];
  for (const file of files) {
    let parsed: HubRow[];
    try {
      parsed = parseHubCsv(file.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "csv-parse";
      return { ok: false, error: message };
    }
    for (const row of parsed) rows.push(row);
    parsedFiles.push({
      fiscalYear: file.fiscalYear,
      body: file.body,
      sha256: sha256(file.body),
      bytes: Buffer.byteLength(file.body),
    });
  }
  const companies = companiesFromHubRows(rows);
  if (companies.length === 0) return { ok: false, error: "empty-index" };
  const indexVersion = indexVersionFor(fingerprint, at);
  const shards = buildShards(companies, indexVersion);
  const fiscalYears = [
    ...new Set(companies.flatMap((company) => company.records.map((record) => record.fiscalYear))),
  ].sort((a, b) => a - b);
  const pointer = JSON.stringify({
    indexVersion,
    normalizerVersion: NORMALIZER_VERSION,
    shardCount: SHARD_COUNT,
    shardKeyPrefix: `${SHARD_KEY_PREFIX}${indexVersion}/`,
    builtAt: at,
    fiscalYears,
  });
  const objects: StoredObject[] = parsedFiles.map((file) => ({
    bucket: "raw" as const,
    key: `${RAW_KEY_PREFIX}${file.fiscalYear}/${file.sha256}.csv`,
    body: file.body,
    contentType: "text/csv" as const,
    cacheControl: "private, max-age=0",
  }));
  objects.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  shards.forEach((shard, index) => {
    objects.push({
      bucket: "public",
      key: `${SHARD_KEY_PREFIX}${indexVersion}/${index}.json`,
      body: shardJson(shard),
      contentType: "application/json",
      cacheControl: "public, max-age=31536000, immutable",
    });
  });
  for (const key of POINTER_KEYS) {
    objects.push(pointerObject(key, pointer));
  }
  const described = parsedFiles
    .map((file) => ({ fiscalYear: file.fiscalYear, sha256: file.sha256, bytes: file.bytes }))
    .sort((a, b) => a.fiscalYear - b.fiscalYear || (a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0));
  return {
    ok: true,
    indexVersion,
    objects,
    snapshot: {
      pk: HUB_PK,
      sk: `FP#${fingerprint}`,
      kind: "dataset-snapshot",
      fingerprint,
      indexVersion,
      checkedAt: at,
      filesJson: JSON.stringify(described),
    },
  };
}

function extractHubCsvLinks(html: string, baseUrl: string): HubLink[] {
  const links: HubLink[] = [];
  const seen = new Set<string>();
  for (const href of hrefs(html)) {
    const url = resolveUscis(href, baseUrl);
    if (url === undefined) continue;
    const year = url.pathname.match(/\/h1b_datahubexport-(\d{4})\.csv$/i);
    if (year === null) continue;
    const fiscalYear = Number(year[1]);
    const absolute = url.toString();
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    links.push({ fiscalYear, url: absolute });
  }
  return links;
}

function extractHubFilesPage(html: string, baseUrl: string): string | undefined {
  for (const href of hrefs(html)) {
    const url = resolveUscis(href, baseUrl);
    if (url === undefined) continue;
    if (!url.pathname.includes(FILES_PAGE_PATH)) continue;
    return url.toString();
  }
  return undefined;
}

function newestFiscalYears(links: readonly HubLink[], keep: number): HubLink[] {
  const byYear = new Map<number, HubLink>();
  for (const link of links) {
    if (!byYear.has(link.fiscalYear)) byYear.set(link.fiscalYear, link);
  }
  return [...byYear.values()].sort((a, b) => b.fiscalYear - a.fiscalYear).slice(0, keep);
}

function dedupeFiles(files: readonly RawCsv[]): RawCsv[] {
  const seen = new Set<string>();
  const unique: RawCsv[] = [];
  for (const file of files) {
    const id = `${file.fiscalYear}:${sha256(file.body)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(file);
  }
  return unique;
}

function hrefs(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    const href = match[1];
    if (href !== undefined) found.push(href);
  }
  return found;
}

function resolveUscis(href: string, baseUrl: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(href, baseUrl);
  } catch {
    return undefined;
  }
  if (!isUscisHttps(url.toString())) return undefined;
  return url;
}

function isUscisHttps(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return HUB_HOSTS.some((host) => host === parsed.hostname);
}

function pointerObject(key: string, body: string): StoredObject {
  return {
    bucket: "public",
    key,
    body,
    contentType: "application/json",
    cacheControl: "public, max-age=3600",
  };
}

async function putPointers(ports: DatasetPorts, body: string): Promise<void> {
  for (const key of POINTER_KEYS) await ports.putObject(pointerObject(key, body));
}

function pointerFromSnapshot(snapshot: StoredSnapshot): string | undefined {
  const fiscalYears = fiscalYearsFromFilesJson(snapshot.filesJson);
  if (fiscalYears === undefined || fiscalYears.length === 0) return undefined;
  if (!snapshot.indexVersion.startsWith("idx-")) return undefined;
  return JSON.stringify({
    indexVersion: snapshot.indexVersion,
    normalizerVersion: NORMALIZER_VERSION,
    shardCount: SHARD_COUNT,
    shardKeyPrefix: `${SHARD_KEY_PREFIX}${snapshot.indexVersion}/`,
    builtAt: snapshot.checkedAt,
    fiscalYears,
  });
}

function fiscalYearsFromFilesJson(filesJson: string): number[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(filesJson);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const years: number[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null || !("fiscalYear" in entry)) return undefined;
    const fiscalYear = entry.fiscalYear;
    if (typeof fiscalYear !== "number" || !Number.isInteger(fiscalYear)) return undefined;
    years.push(fiscalYear);
  }
  return [...new Set(years)].sort((a, b) => a - b);
}

function fingerprintOf(files: readonly RawCsv[]): string {
  const lines = files.map((file) => `${file.fiscalYear}:${sha256(file.body)}`);
  lines.sort();
  return sha256(lines.join("\n"));
}

function indexVersionFor(fingerprint: string, at: string): string {
  const day = at.slice(0, 10).replaceAll("-", "");
  return `idx-${day}-${fingerprint.slice(0, 8)}`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function epochSeconds(at: string): number {
  return Math.floor(Date.parse(at) / 1000);
}

function modeOf(event: unknown): "watch" | "build" | undefined {
  const value = eventValue(event);
  if (value === undefined || value === null) return "watch";
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  if (!("mode" in value)) return "watch";
  if (value.mode === undefined || value.mode === "watch") return "watch";
  if (value.mode === "build") return "build";
  return undefined;
}

function eventValue(event: unknown): unknown {
  if (typeof event !== "string") return event;
  try {
    return JSON.parse(event);
  } catch {
    return event;
  }
}
