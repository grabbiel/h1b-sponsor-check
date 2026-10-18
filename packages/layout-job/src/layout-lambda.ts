import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { PAGE_KINDS, SLOT_NAMES, type PageKind, type Platform, type SlotName } from "@visaspotter/domain";
import { isConditionalCheckFailed, requiredEnv } from "./dynamo.ts";
import {
  PLATFORMS,
  isHitIndex,
  priorDay,
  readAggregateRequest,
  rollupDay,
  type HealthCounters,
  type HealthRow,
  type LayoutAlertItem,
  type LayoutHealth,
  type LayoutStatusItem,
} from "./health.ts";
import { HEALTH_PK_PREFIX, LAYOUT_PK_PREFIX } from "./keys.ts";

export type AggregateResult =
  | {
      outcome: "aggregated";
      day: string;
      layouts: Array<{ platform: Platform; status: LayoutHealth }>;
      alerts: number;
    }
  | { outcome: "bad-mode" }
  | { outcome: "bad-day" };

export async function handler(event: unknown): Promise<AggregateResult> {
  const now = new Date();
  const request = readAggregateRequest(event, now);
  if (!request.ok) return { outcome: request.error };
  const tableName = requiredEnv("TABLE_NAME");
  const documents = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const rows = await queryHealth(documents, tableName, `${HEALTH_PK_PREFIX}${request.day}`);
  const previousDay = priorDay(request.day);
  const previous: Partial<Record<Platform, LayoutHealth>> = {};
  for (const platform of PLATFORMS) {
    const status = await readLayoutStatus(documents, tableName, `${LAYOUT_PK_PREFIX}${platform}`, previousDay);
    if (status !== undefined) previous[platform] = status;
  }
  const nowIso = now.toISOString();
  const rolled = rollupDay({
    day: request.day,
    rows,
    previous,
    now: nowIso,
    alertsEnabled: process.env.ALERTS_ENABLED === "true",
  });
  for (const layout of rolled.layouts) await putLayout(documents, tableName, layout);
  for (const alert of rolled.alerts) await putAlert(documents, tableName, alert);
  return {
    outcome: "aggregated",
    day: request.day,
    layouts: rolled.layouts.map((layout) => ({ platform: layout.platform, status: layout.status })),
    alerts: rolled.alerts.length,
  };
}

async function queryHealth(
  documents: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
): Promise<HealthRow[]> {
  const rows: HealthRow[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await documents.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of page.Items ?? []) rows.push(readHealthItem(item));
    startKey = page.LastEvaluatedKey;
  } while (startKey !== undefined);
  return rows;
}

async function readLayoutStatus(
  documents: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  day: string,
): Promise<LayoutHealth | undefined> {
  const got = await documents.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk, sk: day },
    }),
  );
  if (got.Item === undefined) return undefined;
  const status = got.Item.status;
  if (!isLayoutHealth(status)) throw new Error("bad-layout-status");
  return status;
}

async function putLayout(
  documents: DynamoDBDocumentClient,
  tableName: string,
  item: LayoutStatusItem,
): Promise<void> {
  await documents.send(new PutCommand({ TableName: tableName, Item: item }));
}

async function putAlert(
  documents: DynamoDBDocumentClient,
  tableName: string,
  item: LayoutAlertItem,
): Promise<void> {
  try {
    await documents.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  } catch (error) {
    if (!isConditionalCheckFailed(error)) throw error;
  }
}

function readHealthItem(item: Record<string, unknown>): HealthRow {
  const sk = item.sk;
  const reports = item.reports;
  const misses = item.misses;
  if (typeof sk !== "string" || !isCount(reports) || !isCount(misses)) throw new Error("bad-health-row");
  const parsed = parseSortKey(sk);
  if (parsed === undefined) throw new Error("bad-health-row");
  return {
    ...parsed,
    counters: { reports, misses, hits: readHits(item.hits) },
  };
}

function parseSortKey(
  sk: string,
): Pick<HealthRow, "platform" | "pageKind" | "packVersion" | "slot"> | undefined {
  const parts = sk.split("#");
  if (parts.length !== 4) return undefined;
  const platform = parts[0];
  const pageKind = parts[1];
  const versionText = parts[2];
  const slot = parts[3];
  if (platform === undefined || pageKind === undefined || versionText === undefined || slot === undefined) {
    return undefined;
  }
  if (!isPlatform(platform) || !isPageKind(pageKind) || !isSlotName(slot)) return undefined;
  if (!/^\d+$/.test(versionText)) return undefined;
  const packVersion = Number(versionText);
  if (!Number.isInteger(packVersion) || packVersion < 1) return undefined;
  return { platform, pageKind, packVersion, slot };
}

function readHits(value: unknown): HealthCounters["hits"] {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error("bad-health-row");
  const hits: HealthCounters["hits"] = {};
  for (const [key, count] of Object.entries(value)) {
    if (!/^\d+$/.test(key) || !isCount(count)) throw new Error("bad-health-row");
    const index = Number(key);
    if (!isHitIndex(index)) throw new Error("bad-health-row");
    hits[index] = count;
  }
  return hits;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isLayoutHealth(value: unknown): value is LayoutHealth {
  return value === "ok" || value === "degraded" || value === "broken" || value === "insufficient-data";
}

function isPlatform(value: string): value is Platform {
  return PLATFORMS.some((platform) => platform === value);
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
