import { parseSelectorPack } from "../../domain/src/selector-pack.js";

const PLATFORMS = ["linkedin", "indeed"];
const REFRESH_MS = 24 * 60 * 60 * 1000;

export function selectorPackRequest(message) {
  if (typeof message !== "object" || message === null) return null;
  if (message.origin !== "content") return null;
  if (message.operation !== "selector-pack") return null;
  if (!PLATFORMS.includes(message.platform)) return null;
  return message.platform;
}

export function createSelectorPackClient({
  loadBundled,
  remoteUrl = null,
  extensionVersion,
  store,
  fetch: fetchImpl = globalThis.fetch,
  now = () => Date.now(),
}) {
  const flights = new Map();

  return {
    pack(platform) {
      if (!PLATFORMS.includes(platform)) return Promise.resolve(null);
      const existing = flights.get(platform);
      if (existing !== undefined) return existing;
      const flight = currentPack(platform).finally(() => {
        flights.delete(platform);
      });
      flights.set(platform, flight);
      return flight;
    },
  };

  async function currentPack(platform) {
    const bundled = await bundledPack(platform);
    const remote = await remotePack(platform);
    if (remote !== null && (bundled === null || remote.version > bundled.version)) return remote;
    return bundled;
  }

  async function bundledPack(platform) {
    try {
      return await accepted(await loadBundled(platform), platform);
    } catch {
      return null;
    }
  }

  async function remotePack(platform) {
    if (remoteUrl === null) return null;
    const checkedAt = now();
    const cached = await readCached(platform);
    if (cached !== null && checkedAt - cached.checkedAt < REFRESH_MS) return cached.pack;
    const pack = (await fetchPack(remoteUrl(platform), platform)) ?? cached?.pack ?? null;
    await writeCached(platform, pack, checkedAt);
    return pack;
  }

  async function fetchPack(url, platform) {
    try {
      const response = await fetchImpl(url);
      if (response.ok !== true) return null;
      return await accepted(await response.json(), platform);
    } catch {
      return null;
    }
  }

  async function accepted(input, platform) {
    const parsed = await parseSelectorPack(input);
    if (!parsed.ok || parsed.pack.platform !== platform) return null;
    if (!versionAtLeast(extensionVersion, parsed.pack.minExtensionVersion)) return null;
    return parsed.pack;
  }

  async function readCached(platform) {
    try {
      const text = await store.get(cacheKey(platform));
      if (text === null) return null;
      const value = JSON.parse(text);
      if (!Number.isInteger(value?.checkedAt)) return null;
      const pack = value.pack === null ? null : await accepted(value.pack, platform);
      return { pack, checkedAt: value.checkedAt };
    } catch {
      return null;
    }
  }

  async function writeCached(platform, pack, checkedAt) {
    try {
      await store.set(cacheKey(platform), JSON.stringify({ pack, checkedAt }));
    } catch {
      return;
    }
  }
}

function cacheKey(platform) {
  return `selector-pack/${platform}`;
}

function versionAtLeast(actual, minimum) {
  const have = actual.split(".").map(Number);
  const need = minimum.split(".").map(Number);
  for (let i = 0; i < need.length; i += 1) {
    if ((have[i] ?? 0) !== need[i]) return (have[i] ?? 0) > need[i];
  }
  return true;
}
