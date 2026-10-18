import type { ParsedSelectorPack, SelectorPackBody } from "./types.ts";
import { parseSelectorPack as parseRaw, selectorPackContentHash as hashRaw } from "./selector-pack.js";

export function selectorPackContentHash(body: SelectorPackBody): Promise<string> {
  return hashRaw(body);
}

export function parseSelectorPack(input: unknown): Promise<ParsedSelectorPack> {
  return parseRaw(input) as Promise<ParsedSelectorPack>;
}
