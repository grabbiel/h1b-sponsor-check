export const PAGE_KINDS = ["search", "job"];
export const SLOT_NAMES = ["jobTitle", "companyName", "description", "listingCompanyName", "activeListing"];

const MAX_SELECTOR_LENGTH = 300;
const MAX_CANDIDATES = 8;
const FORBIDDEN = ["<", "url(", "javascript:", "expression(", "@import", "behavior:", "-moz-binding"];
const PACK_KEYS = new Set(["schema", "platform", "version", "minExtensionVersion", "pages"]);
const PAGE_KEYS = new Set(["kind", "detect", "slots"]);

export async function selectorPackContentHash(body) {
  const bytes = new TextEncoder().encode(canonicalJson(body));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function parseSelectorPack(input) {
  if (!isRecord(input) || typeof input.contentHash !== "string") {
    return { ok: false, error: "invalid-pack" };
  }
  const { contentHash, ...rest } = input;
  if ((await selectorPackContentHash(rest)) !== contentHash) {
    return { ok: false, error: "content-hash" };
  }
  const pack = readPack(rest, contentHash);
  if (pack === null) return { ok: false, error: "invalid-pack" };
  if (packHasForbiddenSelector(pack)) return { ok: false, error: "forbidden-selector" };
  return { ok: true, pack };
}

function readPack(body, contentHash) {
  if (Object.keys(body).some((key) => !PACK_KEYS.has(key))) return null;
  if (body.schema !== 1) return null;
  if (body.platform !== "linkedin" && body.platform !== "indeed") return null;
  if (!Number.isInteger(body.version) || body.version < 1) return null;
  if (typeof body.minExtensionVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(body.minExtensionVersion)) {
    return null;
  }
  if (!Array.isArray(body.pages) || body.pages.length === 0) return null;
  const pages = [];
  for (const page of body.pages) {
    const read = readPage(page);
    if (read === null) return null;
    pages.push(read);
  }
  return {
    schema: 1,
    platform: body.platform,
    version: body.version,
    minExtensionVersion: body.minExtensionVersion,
    contentHash,
    pages,
  };
}

function readPage(page) {
  if (!isRecord(page) || Object.keys(page).some((key) => !PAGE_KEYS.has(key))) return null;
  if (!PAGE_KINDS.includes(page.kind)) return null;
  if (!isCandidateList(page.detect)) return null;
  if (!isRecord(page.slots)) return null;
  if (Object.keys(page.slots).some((key) => !SLOT_NAMES.includes(key))) return null;
  const slots = {};
  for (const name of SLOT_NAMES) {
    if (!isCandidateList(page.slots[name])) return null;
    slots[name] = page.slots[name];
  }
  return { kind: page.kind, detect: page.detect, slots };
}

function isCandidateList(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_CANDIDATES && value.every(isSelector);
}

function isSelector(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_SELECTOR_LENGTH;
}

function packHasForbiddenSelector(pack) {
  const selectors = pack.pages.flatMap((page) => [...page.detect, ...SLOT_NAMES.flatMap((name) => page.slots[name])]);
  return selectors.some((selector) => {
    const lower = selector.toLowerCase();
    return FORBIDDEN.some((token) => lower.includes(token));
  });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
