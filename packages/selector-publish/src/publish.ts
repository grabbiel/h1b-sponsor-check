import { parseSelectorPack, type Platform, type SelectorPack } from "@visaspotter/domain";
import { POINTER_CACHE_CONTROL, SHARD_CACHE_CONTROL, type ObjectPut } from "@visaspotter/index-builder/publish";

export const PLATFORMS: readonly Platform[] = ["linkedin", "indeed"];
export const SELECTOR_KEY_PREFIX = "v1/selectors/";
export const SELECTOR_POINTER_KEY = `${SELECTOR_KEY_PREFIX}current.json`;

export type SelectorPointer = {
  schema: 1;
  packs: Record<Platform, string>;
};

export type SelectorPublishPlan = {
  packs: ObjectPut[];
  pointer: ObjectPut;
};

export function packObjectKey(pack: SelectorPack): string {
  return `${SELECTOR_KEY_PREFIX}${pack.platform}/${pack.version}-${pack.contentHash}.json`;
}

export async function acceptedPack(input: unknown, platform: Platform): Promise<SelectorPack> {
  const parsed = await parseSelectorPack(input);
  if (!parsed.ok) throw new Error(`${platform} pack is rejected: ${parsed.error}`);
  if (parsed.pack.platform !== platform) throw new Error(`${platform} pack names platform ${parsed.pack.platform}`);
  return parsed.pack;
}

export function selectorPublishPlan(packs: Record<Platform, SelectorPack>): SelectorPublishPlan {
  const pointer: SelectorPointer = {
    schema: 1,
    packs: { linkedin: packObjectKey(packs.linkedin), indeed: packObjectKey(packs.indeed) },
  };
  return {
    packs: PLATFORMS.map((platform) => ({
      key: packObjectKey(packs[platform]),
      body: JSON.stringify(packs[platform]),
      cacheControl: SHARD_CACHE_CONTROL,
      contentType: "application/json",
    })),
    pointer: {
      key: SELECTOR_POINTER_KEY,
      body: JSON.stringify(pointer),
      cacheControl: POINTER_CACHE_CONTROL,
      contentType: "application/json",
    },
  };
}

export function readSelectorPointer(input: unknown): SelectorPointer | null {
  if (typeof input !== "object" || input === null) return null;
  const { schema, packs } = input as Record<string, unknown>;
  if (schema !== 1 || typeof packs !== "object" || packs === null) return null;
  const keys = packs as Record<string, unknown>;
  for (const platform of PLATFORMS) {
    const key = keys[platform];
    if (typeof key !== "string" || !key.startsWith(`${SELECTOR_KEY_PREFIX}${platform}/`)) return null;
  }
  return { schema: 1, packs: { linkedin: keys.linkedin as string, indeed: keys.indeed as string } };
}
