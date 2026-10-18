declare const companyKeyBrand: unique symbol;

export type CompanyKey = string & { readonly [companyKeyBrand]: "CompanyKey" };

export { NORMALIZER_VERSION } from "./normalize.js";

export type KnownLikelihood = "frequent" | "occasional" | "rare" | "none";

export type Likelihood = KnownLikelihood | "unknown";

export type FiscalYear = number;

export type SponsorRecord = {
  fiscalYear: FiscalYear;
  initialApprovals: number;
  initialDenials: number;
  continuingApprovals: number;
  continuingDenials: number;
};

export type Company = {
  key: CompanyKey;
  displayName: string;
  likelihood: KnownLikelihood;
  records: SponsorRecord[];
};

export type Platform = "linkedin" | "indeed";

export type Posting = {
  platform: Platform;
  companyName: string;
  title?: string;
  description?: string;
};

export type LanguageVerdict =
  | { kind: "explicit-no"; ruleId: string; excerpt: string }
  | { kind: "sponsor-ok" };

export type CompanyVerdict =
  | { match: "matched"; companyId: CompanyKey; likelihood: KnownLikelihood }
  | { match: "unmatched"; companyId: null; likelihood: "unknown" };

export type Verdict = {
  language: LanguageVerdict;
  company: CompanyVerdict;
};

export { PAGE_KINDS, SLOT_NAMES } from "./selector-pack.js";

export type PageKind = "search" | "job";

export type SlotName = "jobTitle" | "companyName" | "description" | "listingCompanyName" | "activeListing";

export type SelectorPage = {
  kind: PageKind;
  detect: string[];
  slots: Record<SlotName, string[]>;
};

export type SelectorPack = {
  schema: 1;
  platform: Platform;
  version: number;
  minExtensionVersion: string;
  contentHash: string;
  pages: SelectorPage[];
};

export type SelectorPackBody = Omit<SelectorPack, "contentHash">;

export type SelectorPackError = "content-hash" | "forbidden-selector" | "invalid-pack";

export type ParsedSelectorPack =
  | { ok: true; pack: SelectorPack }
  | { ok: false; error: SelectorPackError };
