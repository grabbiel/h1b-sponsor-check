import type { KnownLikelihood, SponsorRecord } from "./types.ts";

// Initial approvals count new sponsorships. Continuing approvals are renewals and stay out of the score.
const YEAR_DECAY = 0.6;
const FREQUENT_AT = 20;
const OCCASIONAL_AT = 3;

export function computeLikelihood(records: readonly SponsorRecord[]): KnownLikelihood {
  if (records.length === 0) return "none";
  const latestYear = Math.max(...records.map((record) => record.fiscalYear));
  let score = 0;
  for (const record of records) {
    score += YEAR_DECAY ** (latestYear - record.fiscalYear) * record.initialApprovals;
  }
  if (score >= FREQUENT_AT) return "frequent";
  if (score >= OCCASIONAL_AT) return "occasional";
  if (score > 0) return "rare";
  return "none";
}
