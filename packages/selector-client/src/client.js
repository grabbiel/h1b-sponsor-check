import { parseSelectorPack } from "../../domain/src/selector-pack.js";

const PLATFORMS = ["linkedin", "indeed"];
const REFRESH_MS = 24 * 60 * 60 * 1000;
const CACHE_KEY = "selector-packs";

export function selectorPackRequest(message) {
  if (typeof message !== "object" || message === null) return null;
  if (message.origin !== "content") return null;
  if (message.operation !== "selector-pack") return null;
  if (!PLATFORMS.includes(message.platform)) return null;
  return message.platform;
}

export function createSelectorPackClient({
  loadBundled,
  pointerUrl = null,
  extensionVersion,
  store,
  fetch: fetchImpl = globalThis.fetch,
  now = () => Date.now(),
}) {
  let flight = null;

  return {
    async pack(platform) {
      if (!PLATFORMS.includes(platform)) return null;
      const [bundled, remote] = await Promise.all([bundledPack(platform), remotePacks()]);
      const candidate = remote[platform] ?? null;
      if (candidate !== null && (bundled === null || candidate.version > bundled.version)) return candidate;
      return bundled;
    },
  };

  async function bundledPack(platform) {
    try {
      return await accepted(await loadBundled(platform), platform);
    } catch {
      return null;
    }
  }

  function remotePacks() {
    if (pointerUrl === null) return Promise.resolve({});
    flight ??= refresh().finally(() => {
      flight = null;
    });
    return flight;
  }

  async function refresh() {
    const checkedAt = now();
    const cached = await readCached();
    if (cached !== null && checkedAt - cached.checkedAt < REFRESH_MS) return cached.packs;
    const pointer = await fetchJson(pointerUrl);
    const keys = pointer?.schema === 1 ? pointer.packs : undefined;
    const entries = await Promise.all(
      PLATFORMS.map(async (platform) => [
        platform,
        (await fetchPack(keys?.[platform], platform)) ?? cached?.packs[platform] ?? null,
      ]),
    );
    const packs = Object.fromEntries(entries);
    await writeCached(packs, checkedAt);
    return packs;
  }

  async function fetchPack(key, platform) {
    if (typeof key !== "string" || !key.startsWith(`v1/selectors/${platform}/`)) return null;
    try {
      const body = await fetchJson(new URL(`/${key}`, pointerUrl).href);
      return body === null ? null : await accepted(body, platform);
    } catch {
      return null;
    }
  }

  async function fetchJson(url) {
    try {
      const response = await fetchImpl(url);
      if (response.ok !== true) return null;
      return await response.json();
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

  async function readCached() {
    try {
      const text = await store.get(CACHE_KEY);
      if (text === null) return null;
      const value = JSON.parse(text);
      if (!Number.isInteger(value?.checkedAt)) return null;
      const entries = await Promise.all(
        PLATFORMS.map(async (platform) => {
          const pack = value.packs?.[platform] ?? null;
          return [platform, pack === null ? null : await accepted(pack, platform)];
        }),
      );
      return { packs: Object.fromEntries(entries), checkedAt: value.checkedAt };
    } catch {
      return null;
    }
  }

  async function writeCached(packs, checkedAt) {
    try {
      await store.set(CACHE_KEY, JSON.stringify({ packs, checkedAt }));
    } catch {
      return;
    }
  }
}

function versionAtLeast(actual, minimum) {
  const have = actual.split(".").map(Number);
  const need = minimum.split(".").map(Number);
  for (let i = 0; i < need.length; i += 1) {
    if ((have[i] ?? 0) !== need[i]) return (have[i] ?? 0) > need[i];
  }
  return true;
}
