import { scanLanguage } from "../../packages/domain/src/language.js";

const UNMATCHED = { match: "unmatched", companyId: null, likelihood: "unknown" };
const GLASSDOOR = 3;

export function companyBadgeFromLookup(result) {
  if (result == null || result.match !== "matched" || result.company == null) {
    return {
      mark: "no-record",
      likelihood: "unknown",
      rankBand: null,
      label: "No record",
    };
  }
  const likelihood = result.company.likelihood;
  const rankBand = result.rankBand ?? null;
  if (likelihood === "none") {
    return { mark: "no-sponsor", likelihood, rankBand, label: `${likelihood}, rank ${rankBand}` };
  }
  return { mark: "sponsor", likelihood, rankBand, label: `${likelihood}, rank ${rankBand}` };
}

export function postingBadgeFromDescription(description) {
  const verdict = scanLanguage(typeof description === "string" ? description : "");
  if (verdict.kind === "explicit-no") {
    return { mark: "no-sponsor", label: "NoSponsor" };
  }
  return { mark: "sponsor", label: "Sponsor" };
}

export async function companyBadgeForName(name, lookup) {
  let result;
  try {
    result = await lookup(name);
  } catch {
    result = UNMATCHED;
  }
  return companyBadgeFromLookup(result);
}

export function popupSummary(companyName, languageBadge, companyBadge) {
  const name = escapeText(companyName ?? "");
  const language = languageBadge?.label === "NoSponsor" ? "NoSponsor" : "Sponsor";
  if (companyBadge == null || companyBadge.mark === "no-record") {
    return `${language}. No H-1B record for ${name}.`;
  }
  const rank = companyBadge.rankBand == null ? "unknown" : companyBadge.rankBand;
  return `${language}. ${name} likelihood ${escapeText(companyBadge.likelihood)}, rank ${escapeText(rank)}.`;
}

export function matchPath(platformCode) {
  return platformCode === GLASSDOOR ? "php" : "index";
}

export function companyBadgeFromPhp(cstatus) {
  if (cstatus == 1) {
    return { mark: "sponsor", likelihood: "unknown", rankBand: null, label: "Sponsor" };
  }
  return companyBadgeFromLookup(UNMATCHED);
}

function escapeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
