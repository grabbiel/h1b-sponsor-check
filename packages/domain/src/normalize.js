export const NORMALIZER_VERSION = 1;

const LEGAL_SUFFIXES = new Set([
  "inc",
  "llc",
  "ltd",
  "corp",
  "corporation",
  "co",
  "company",
  "lp",
  "llp",
  "plc",
  "pllc",
  "pc",
]);

export function normalizeCompanyName(raw) {
  const folded = raw.normalize("NFKC").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const words = folded
    .replaceAll("&", " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words[0] === "the") words.shift();
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1] ?? "")) {
    words.pop();
  }
  return words.join(" ");
}
