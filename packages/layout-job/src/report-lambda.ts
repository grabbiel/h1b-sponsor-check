import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { isConditionalCheckFailed, requiredEnv } from "./dynamo.ts";
import type { HealthUpdate } from "./health.ts";
import { handleReport, type ReportResponse, type UnmatchedUpdate } from "./report.ts";

type JsonHeaders = { "content-type": "application/json" };

export type ReportLambdaResult =
  | { statusCode: 204 }
  | { statusCode: Exclude<ReportResponse["statusCode"], 204>; headers: JsonHeaders; body: string };

export async function handler(event: unknown): Promise<ReportLambdaResult> {
  const decision = handleReport(event, new Date());
  if (decision.statusCode !== 204) {
    return {
      statusCode: decision.statusCode,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: decision.error }),
    };
  }
  const tableName = requiredEnv("TABLE_NAME");
  const documents = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  if (decision.kind === "health") {
    for (const update of decision.updates) await applyUpdate(documents, tableName, update);
  } else {
    for (const update of decision.updates) await applyUnmatched(documents, tableName, update);
  }
  return { statusCode: 204 };
}

async function applyUnmatched(
  documents: DynamoDBDocumentClient,
  tableName: string,
  update: UnmatchedUpdate,
): Promise<void> {
  await documents.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: update.pk, sk: update.sk },
      UpdateExpression:
        "ADD #count :one SET lastSeen = :at, sampleRaw = if_not_exists(sampleRaw, :sample), #ttl = if_not_exists(#ttl, :ttl), kind = if_not_exists(kind, :kind)",
      ExpressionAttributeNames: { "#count": "count", "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":one": 1,
        ":at": update.at,
        ":sample": update.sampleRaw,
        ":ttl": update.ttl,
        ":kind": "unmatched-company",
      },
    }),
  );
}

async function applyUpdate(
  documents: DynamoDBDocumentClient,
  tableName: string,
  update: HealthUpdate,
): Promise<void> {
  const key = { pk: update.pk, sk: update.sk };
  const misses = update.outcome === "miss" ? 1 : 0;
  const createdHits = update.outcome === "hit" ? { [String(update.index)]: 1 } : {};
  try {
    await documents.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        ConditionExpression: "attribute_not_exists(pk)",
        UpdateExpression: "SET reports = :one, misses = :misses, hits = :hits, kind = :kind, #ttl = :ttl",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ":one": 1,
          ":misses": misses,
          ":hits": createdHits,
          ":kind": "selector-health",
          ":ttl": update.ttl,
        },
      }),
    );
  } catch (error) {
    if (!isConditionalCheckFailed(error)) throw error;
    const names: Record<string, string> = { "#ttl": "ttl" };
    const values: Record<string, number> = {
      ":one": 1,
      ":misses": misses,
      ":ttl": update.ttl,
    };
    let expression =
      "SET reports = reports + :one, misses = misses + :misses, #ttl = if_not_exists(#ttl, :ttl)";
    if (update.outcome === "hit") {
      names["#hits"] = "hits";
      names["#idx"] = String(update.index);
      values[":zero"] = 0;
      expression += ", #hits.#idx = if_not_exists(#hits.#idx, :zero) + :one";
    }
    await documents.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: expression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  }
}
