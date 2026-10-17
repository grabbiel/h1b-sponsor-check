import type { LanguageVerdict } from "./types.ts";

const PHRASE_RULES: readonly { id: string; phrases: readonly string[] }[] = [
  {
    id: "unable-to-sponsor",
    phrases: [
      "unable to sponsor",
      "not able to sponsor",
      "cannot sponsor",
      "can not sponsor",
      "will not sponsor",
      "does not sponsor",
      "do not sponsor",
    ],
  },
  {
    id: "no-sponsorship",
    phrases: [
      "no sponsorship",
      "sponsorship is not available",
      "not eligible for sponsorship",
      "without sponsorship",
      "without the need for sponsorship",
      "without requiring sponsorship",
    ],
  },
  {
    id: "citizens-only",
    phrases: [
      "must be a us citizen",
      "us citizenship is required",
      "us citizens only",
      "green card holders only",
      "us persons only",
    ],
  },
];

export function normalizeDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replaceAll("u.s.", "us")
    .replace(/\s+/g, " ")
    .trim();
}

export function scanLanguage(description: string): LanguageVerdict {
  const text = normalizeDescription(description);
  for (const rule of PHRASE_RULES) {
    for (const phrase of rule.phrases) {
      if (text.includes(phrase)) {
        return { kind: "explicit-no", ruleId: rule.id, excerpt: phrase };
      }
    }
  }
  return { kind: "sponsor-ok" };
}
