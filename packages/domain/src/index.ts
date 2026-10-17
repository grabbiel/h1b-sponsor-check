export { normalizeCompanyName, NORMALIZER_VERSION } from "./normalize.ts";
export { normalizeDescription, scanLanguage } from "./language.ts";
export { computeLikelihood } from "./likelihood.ts";
export { companyVerdict, verdict } from "./verdict.ts";
export { parseSelectorPack, selectorPackContentHash } from "./selector-pack.ts";
export { PAGE_KINDS, SLOT_NAMES } from "./types.ts";
export type {
  Company,
  CompanyKey,
  CompanyVerdict,
  KnownLikelihood,
  LanguageVerdict,
  Likelihood,
  PageKind,
  ParsedSelectorPack,
  Platform,
  Posting,
  SelectorPack,
  SelectorPackBody,
  SelectorPackError,
  SlotName,
  SponsorRecord,
  Verdict,
} from "./types.ts";
