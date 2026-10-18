const CACHE_NAME = "visaspotter-index";

export function memoryIndexStore() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, text) {
      values.set(key, text);
    },
    async dropShardsExcept(indexVersion) {
      const prefix = `shard/${indexVersion}/`;
      for (const key of [...values.keys()]) {
        if (key.startsWith("shard/") && !key.startsWith(prefix)) values.delete(key);
      }
    },
  };
}

export function cacheApiIndexStore(caches) {
  return {
    async get(key) {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(cacheUrl(key));
      if (hit == null) return null;
      return hit.text();
    },
    async set(key, text) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        cacheUrl(key),
        new Response(text, { headers: { "content-type": "application/json" } }),
      );
    },
    async dropShardsExcept(indexVersion) {
      const cache = await caches.open(CACHE_NAME);
      const keep = `/index/shard/${indexVersion}/`;
      for (const request of await cache.keys()) {
        const url = typeof request === "string" ? request : request.url;
        if (!url.includes("/index/shard/")) continue;
        if (url.includes(keep)) continue;
        await cache.delete(request);
      }
    },
  };
}

function cacheUrl(key) {
  // Cache API entries are URLs. This host is never requested, so a saved pointer stays separate from the CloudFront response.
  return `https://visaspotter.invalid/index/${key}`;
}
