import { createHash } from "node:crypto";
import { PAGE_KINDS, SLOT_NAMES, type ParsedSelectorPack, type SelectorPack, type SelectorPackBody, type SlotName } from "./types.ts";

const MAX_SELECTOR_LENGTH = 300;
const MAX_CANDIDATES = 8;
const FORBIDDEN = ["<", "url(", "javascript:", "expression(", "@import", "behavior:", "-moz-binding"];

export function selectorPackContentHash(body: SelectorPackBody): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

export function parseSelectorPack(input: unknown): ParsedSelectorPack {
  if (!isRecord(input) || typeof input.contentHash !== "string") {
    return { ok: false, error: "invalid-pack" };
  }
  const { contentHash, ...rest } = input;
  if (selectorPackContentHash(rest as SelectorPackBody) !== contentHash) {
    return { ok: false, error: "content-hash" };
  }
  const pack = readPack(rest, contentHash);
  if (pack === null) return { ok: false, error: "invalid-pack" };
  if (packHasForbiddenSelector(pack)) return { ok: false, error: "forbidden-selector" };
  return { ok: true, pack };
}

const PACK_KEYS = new Set(["schema", "platform", "version", "minExtensionVersion", "pages"]);
const PAGE_KEYS = new Set(["kind", "detect", "slots"]);

function readPack(body: Record<string, unknown>, contentHash: string): SelectorPack | null {
  if (Object.keys(body).some((key) => !PACK_KEYS.has(key))) return null;
  if (body.schema !== 1) return null;
  if (body.platform !== "linkedin" && body.platform !== "indeed") return null;
  if (!Number.isInteger(body.version) || (body.version as number) < 1) return null;
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
    version: body.version as number,
    minExtensionVersion: body.minExtensionVersion,
    contentHash,
    pages,
  };
}

function readPage(page: unknown): SelectorPack["pages"][number] | null {
  if (!isRecord(page) || Object.keys(page).some((key) => !PAGE_KEYS.has(key))) return null;
  if (typeof page.kind !== "string" || !PAGE_KINDS.includes(page.kind as (typeof PAGE_KINDS)[number])) {
    return null;
  }
  if (!Array.isArray(page.detect) || page.detect.length === 0 || page.detect.length > MAX_CANDIDATES) return null;
  if (!page.detect.every(isSelector)) return null;
  if (!isRecord(page.slots)) return null;
  const slots = {} as SelectorPack["pages"][number]["slots"];
  for (const name of SLOT_NAMES) {
    const candidates = page.slots[name];
    if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > MAX_CANDIDATES) return null;
    if (!candidates.every(isSelector)) return null;
    slots[name] = candidates;
  }
  if (Object.keys(page.slots).some((key) => !SLOT_NAMES.includes(key as SlotName))) return null;
  return { kind: page.kind as SelectorPack["pages"][number]["kind"], detect: page.detect, slots };
}

function isSelector(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_SELECTOR_LENGTH;
}

function packHasForbiddenSelector(pack: SelectorPack): boolean {
  const selectors = pack.pages.flatMap((page) => [
    ...page.detect,
    ...SLOT_NAMES.flatMap((name) => page.slots[name]),
  ]);
  return selectors.some((selector) => {
    const lower = selector.toLowerCase();
    return FORBIDDEN.some((token) => lower.includes(token));
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
