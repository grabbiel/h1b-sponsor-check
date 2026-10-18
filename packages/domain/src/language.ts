import type { LanguageVerdict } from "./types.ts";
import {
  normalizeDescription as normalizeDescriptionRaw,
  scanLanguage as scanLanguageRaw,
} from "./language.js";

export function normalizeDescription(text: string): string {
  return normalizeDescriptionRaw(text);
}

export function scanLanguage(description: string): LanguageVerdict {
  return scanLanguageRaw(description);
}
