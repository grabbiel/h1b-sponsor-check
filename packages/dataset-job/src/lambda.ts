import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { HUB_PK, RAW_KEY_PREFIX } from "./keys.ts";
import {
  runDataset,
  type DatasetEnv,
  type DatasetPorts,
  type DatasetResult,
  type OpsItem,
  type RawCsv,
} from "./run.ts";

const USER_AGENT = "VisaSpotter/0.0 (dataset-watch)";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") throw new Error(`missing ${name}`);
  return value;
}

function fiscalYearFromKey(key: string): number | undefined {
  if (!key.startsWith(RAW_KEY_PREFIX) || !key.endsWith(".csv")) return undefined;
  const rest = key.slice(RAW_KEY_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash !== 4) return undefined;
  const year = rest.slice(0, slash);
  if (!/^\d{4}$/.test(year)) return undefined;
  return Number(year);
}

function opsRecord(item: OpsItem): Record<string, string | number> {
  switch (item.kind) {
    case "dataset-check":
      if (item.status === "failed") {
        return {
          pk: item.pk,
          sk: item.sk,
          kind: item.kind,
          status: item.status,
          error: item.error,
          at: item.at,
          ttl: item.ttl,
        };
      }
      return {
        pk: item.pk,
        sk: item.sk,
        kind: item.kind,
        status: item.status,
        at: item.at,
        ttl: item.ttl,
      };
    case "dataset-snapshot":
      return {
        pk: item.pk,
        sk: item.sk,
        kind: item.kind,
        fingerprint: item.fingerprint,
        indexVersion: item.indexVersion,
        checkedAt: item.checkedAt,
        filesJson: item.filesJson,
      };
    case "alert-log":
      return {
        pk: item.pk,
        sk: item.sk,
        kind: item.kind,
        status: item.status,
        reason: item.reason,
        at: item.at,
        ttl: item.ttl,
      };
    default: {
      const never: never = item;
      throw new Error(`unknown ops item ${JSON.stringify(never)}`);
    }
  }
}

export async function handler(event: unknown): Promise<DatasetResult> {
  const rawBucket = required("RAW_BUCKET");
  const publicBucket = required("PUBLIC_BUCKET");
  const tableName = required("TABLE_NAME");
  const hubUrl = required("HUB_URL");
  const s3 = new S3Client({});
  const documents = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const ports: DatasetPorts = {
    fetchText: async (url) => {
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,text/csv,*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
      });
      return { status: response.status, body: await response.text() };
    },
    getSnapshot: async (fingerprint) => {
      const got = await documents.send(
        new GetCommand({
          TableName: tableName,
          Key: { pk: HUB_PK, sk: `FP#${fingerprint}` },
        }),
      );
      const item = got.Item;
      if (item === undefined) return undefined;
      const indexVersion = item.indexVersion;
      const checkedAt = item.checkedAt;
      const filesJson = item.filesJson;
      if (typeof indexVersion !== "string" || typeof checkedAt !== "string" || typeof filesJson !== "string") {
        return undefined;
      }
      return { indexVersion, checkedAt, filesJson };
    },
    listRawCsv: async () => {
      const files: RawCsv[] = [];
      let token: string | undefined;
      do {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket: rawBucket,
            Prefix: RAW_KEY_PREFIX,
            ContinuationToken: token,
          }),
        );
        for (const object of page.Contents ?? []) {
          const key = object.Key;
          if (key === undefined) continue;
          const fiscalYear = fiscalYearFromKey(key);
          if (fiscalYear === undefined) continue;
          const got = await s3.send(new GetObjectCommand({ Bucket: rawBucket, Key: key }));
          if (got.Body === undefined) continue;
          files.push({ fiscalYear, body: await got.Body.transformToString() });
        }
        token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
      } while (token !== undefined);
      return files;
    },
    putObject: async (object) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: object.bucket === "raw" ? rawBucket : publicBucket,
          Key: object.key,
          Body: object.body,
          ContentType: object.contentType,
          CacheControl: object.cacheControl,
        }),
      );
    },
    putItem: async (item) => {
      await documents.send(
        new PutCommand({
          TableName: tableName,
          Item: opsRecord(item),
        }),
      );
    },
  };
  const env: DatasetEnv = {
    alertsEnabled: process.env.ALERTS_ENABLED === "true",
    hubUrl,
    now: new Date().toISOString(),
  };
  return runDataset(event, ports, env);
}
