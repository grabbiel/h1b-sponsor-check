import { createHash } from "node:crypto";
import { NORMALIZER_VERSION, type Company } from "@visaspotter/domain";
import { SHARD_COUNT, shardJson, type ShardFile } from "./build.ts";

export const SHARD_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const POINTER_CACHE_CONTROL = "public, max-age=3600";

export const SHARD_KEY_PREFIX = "v1/index/";
export const INDEX_POINTER_KEYS = ["v1/index/current.json", "index/current.json"] as const;

export type IndexPointer = {
  indexVersion: string;
  normalizerVersion: number;
  shardCount: number;
  shardKeyPrefix: string;
  builtAt: string;
  fiscalYears: number[];
};

export type ObjectPut = {
  key: string;
  body: string;
  cacheControl: string;
  contentType: "application/json";
};

export type PublishPlan = {
  shards: ObjectPut[];
  pointers: ObjectPut[];
};

export function shardObjectKey(indexVersion: string, shard: number): string {
  return `${SHARD_KEY_PREFIX}${indexVersion}/${shard}.json`;
}

export function fiscalYearsOf(companies: readonly Company[]): number[] {
  const years = new Set<number>();
  for (const company of companies) {
    for (const record of company.records) years.add(record.fiscalYear);
  }
  return [...years].sort((a, b) => a - b);
}

export function indexPointer(input: {
  indexVersion: string;
  builtAt: string;
  fiscalYears: readonly number[];
}): IndexPointer {
  return {
    indexVersion: input.indexVersion,
    normalizerVersion: NORMALIZER_VERSION,
    shardCount: SHARD_COUNT,
    shardKeyPrefix: `${SHARD_KEY_PREFIX}${input.indexVersion}/`,
    builtAt: input.builtAt,
    fiscalYears: [...input.fiscalYears].sort((a, b) => a - b),
  };
}

export function pointerJson(pointer: IndexPointer): string {
  return JSON.stringify({
    indexVersion: pointer.indexVersion,
    normalizerVersion: pointer.normalizerVersion,
    shardCount: pointer.shardCount,
    shardKeyPrefix: pointer.shardKeyPrefix,
    builtAt: pointer.builtAt,
    fiscalYears: pointer.fiscalYears,
  });
}

export function indexVersionFor(shards: readonly ShardFile[], now: Date): string {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const hash = createHash("sha256");
  for (const shard of shards) {
    hash.update(shardJson({ ...shard, indexVersion: "ignored" }));
    hash.update("\0");
  }
  return `idx-${day}-${hash.digest("hex").slice(0, 8)}`;
}

export function publishPlan(input: { shards: readonly ShardFile[]; pointer: IndexPointer }): PublishPlan {
  const body = pointerJson(input.pointer);
  return {
    shards: input.shards.map((shard, index) => ({
      key: shardObjectKey(input.pointer.indexVersion, index),
      body: shardJson(shard),
      cacheControl: SHARD_CACHE_CONTROL,
      contentType: "application/json",
    })),
    pointers: INDEX_POINTER_KEYS.map((key) => ({
      key,
      body,
      cacheControl: POINTER_CACHE_CONTROL,
      contentType: "application/json",
    })),
  };
}
