import { scanLanguage } from "./language.ts";
import type { Company, CompanyVerdict, Posting, Verdict } from "./types.ts";

export function companyVerdict(company: Company | null): CompanyVerdict {
  if (company === null) {
    return { match: "unmatched", companyId: null, likelihood: "unknown" };
  }
  return { match: "matched", companyId: company.key, likelihood: company.likelihood };
}

export function verdict(posting: Posting, company: Company | null): Verdict {
  return {
    language: scanLanguage(posting.description ?? ""),
    company: companyVerdict(company),
  };
}
