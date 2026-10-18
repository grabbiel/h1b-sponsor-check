import { normalizeCompanyName } from "../../domain/src/normalize.js";
import { shardIndex } from "../../domain/src/shard.js";
import { findEntry, matched, parsePointer, parseShard, unmatched } from "./parse.js";

export const INDEX_BASE = "https://d24ktdd0rusd1i.cloudfront.net";
const POINTER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const POINTER_KEY = "pointer";

export function createIndexClient({ baseUrl, store, fetch: fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  const origin = indexOrigin(baseUrl);
  if (origin === null) throw new Error("index base must be an https origin");
  let pointerPromise = null;
  const shardPromises = new Map();

  return {
    lookup(name) {
      return lookupName(name);
    },
  };

  async function lookupName(name) {
    if (typeof name !== "string") return unmatched();
    const key = normalizeCompanyName(name);
    if (key.length === 0) return unmatched();
    const pointer = await currentPointer();
    if (pointer === null) return unmatched();
    const file = await currentShard(pointer.indexVersion, shardIndex(key));
    if (file === null) return unmatched();
    const found = findEntry(file.entries, key);
    if (found === null) return unmatched();
    return matched(found.key, found.entry);
  }

  function currentPointer() {
    if (pointerPromise === null) {
      pointerPromise = loadPointer().finally(() => {
        pointerPromise = null;
      });
    }
    return pointerPromise;
  }

  async function loadPointer() {
    const fetchedAt = now();
    const cached = await readPointer();
    if (cached !== null && fetchedAt - cached.fetchedAt < POINTER_MAX_AGE_MS) {
      if (cached.pointer !== null) await forgetOtherShards(cached.pointer.indexVersion);
      return cached.pointer;
    }
    const next = await fetchPointer();
    const pointer = next ?? cached?.pointer ?? null;
    await writePointer(pointer, fetchedAt);
    if (pointer !== null) await forgetOtherShards(pointer.indexVersion);
    return pointer;
  }

  async function fetchPointer() {
    const url = `${origin}/v1/index/current.json`;
    const text = await fetchText(url);
    if (text === null) return null;
    try {
      return parsePointer(JSON.parse(text));
    } catch {
      return null;
    }
  }

  function currentShard(indexVersion, shard) {
    const flight = `${indexVersion}/${shard}`;
    const existing = shardPromises.get(flight);
    if (existing !== undefined) return existing;
    const promise = loadShard(indexVersion, shard).finally(() => {
      shardPromises.delete(flight);
    });
    shardPromises.set(flight, promise);
    return promise;
  }

  async function loadShard(indexVersion, shard) {
    const key = `shard/${indexVersion}/${shard}`;
    const cached = await readShard(key, indexVersion);
    if (cached !== null) return cached;
    const text = await fetchText(`${origin}/v1/index/${indexVersion}/${shard}.json`);
    if (text === null) return null;
    const parsed = parseShardText(text, indexVersion);
    if (parsed === null) return null;
    await writeKey(key, text);
    return parsed;
  }

  async function readPointer() {
    const text = await readKey(POINTER_KEY);
    if (text === null) return null;
    try {
      return parseCachedPointer(JSON.parse(text));
    } catch {
      return null;
    }
  }

  async function readShard(key, indexVersion) {
    const text = await readKey(key);
    if (text === null) return null;
    return parseShardText(text, indexVersion);
  }

  async function writePointer(pointer, fetchedAt) {
    await writeKey(POINTER_KEY, JSON.stringify({ pointer, fetchedAt }));
  }

  async function readKey(key) {
    try {
      return await store.get(key);
    } catch {
      return null;
    }
  }

  async function writeKey(key, text) {
    try {
      await store.set(key, text);
    } catch {
      return;
    }
  }

  async function forgetOtherShards(indexVersion) {
    try {
      await store.dropShardsExcept(indexVersion);
    } catch {
      return;
    }
  }

  async function fetchText(url) {
    let response;
    try {
      response = await fetchImpl(url);
    } catch {
      return null;
    }
    if (response.ok !== true) return null;
    if (!sameResource(url, response.url)) return null;
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

function parseShardText(text, indexVersion) {
  try {
    return parseShard(JSON.parse(text), indexVersion);
  } catch {
    return null;
  }
}

function parseCachedPointer(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  if (!Number.isInteger(value.fetchedAt)) return null;
  if (value.pointer === null) return { pointer: null, fetchedAt: value.fetchedAt };
  const pointer = parsePointer(value.pointer);
  if (pointer === null) return null;
  return { pointer, fetchedAt: value.fetchedAt };
}

function indexOrigin(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;
  return url.origin;
}

function sameResource(expected, actual) {
  if (typeof actual !== "string" || actual.length === 0) return false;
  let expectedUrl;
  let actualUrl;
  try {
    expectedUrl = new URL(expected);
    actualUrl = new URL(actual);
  } catch {
    return false;
  }
  return expectedUrl.origin === actualUrl.origin && expectedUrl.pathname === actualUrl.pathname;
}
