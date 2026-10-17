import assert from "node:assert/strict";
import test from "node:test";
import {
  companyVerdict,
  computeLikelihood,
  normalizeCompanyName,
  parseSelectorPack,
  scanLanguage,
  selectorPackContentHash,
  verdict,
  type Company,
  type SelectorPackBody,
  type SponsorRecord,
} from "../src/index.ts";

function record(fiscalYear: number, initialApprovals: number): SponsorRecord {
  return {
    fiscalYear,
    initialApprovals,
    initialDenials: 0,
    continuingApprovals: 0,
    continuingDenials: 0,
  };
}

test("GOOGLE LLC and Google, Inc. share a lookup key", () => {
  const llc = normalizeCompanyName("GOOGLE LLC");
  const inc = normalizeCompanyName("Google, Inc.");
  assert.equal(llc, inc);
  assert.equal(llc, "google");
});

test("normalization folds accents, ampersands, and a leading the", () => {
  assert.equal(normalizeCompanyName("Café, Inc."), "cafe");
  assert.equal(normalizeCompanyName("AT&T Inc."), "at and t");
  assert.equal(normalizeCompanyName("The Google LLC"), "google");
});

test("a description with no negative phrase is sponsor-ok", () => {
  assert.deepEqual(scanLanguage(""), { kind: "sponsor-ok" });
  assert.deepEqual(scanLanguage("sponsorship"), { kind: "sponsor-ok" });
  assert.deepEqual(scanLanguage("We offer visa sponsorship for this role."), { kind: "sponsor-ok" });
});

test("we do not sponsor is explicit-no", () => {
  assert.deepEqual(scanLanguage("We do not sponsor H-1B visas."), {
    kind: "explicit-no",
    ruleId: "unable-to-sponsor",
    excerpt: "do not sponsor",
  });
});

test("likelihood follows decayed initial approvals", () => {
  assert.equal(computeLikelihood([record(2024, 0)]), "none");
  assert.equal(computeLikelihood([record(2024, 1)]), "rare");
  assert.equal(computeLikelihood([record(2024, 3)]), "occasional");
  assert.equal(computeLikelihood([record(2024, 20)]), "frequent");
  assert.equal(computeLikelihood([record(2024, 17), record(2023, 4)]), "occasional");
  assert.equal(computeLikelihood([record(2024, 2), record(2023, 40)]), "frequent");
});

test("an unmatched company has a null id and unknown likelihood", () => {
  const result = companyVerdict(null);
  assert.deepEqual(result, { match: "unmatched", companyId: null, likelihood: "unknown" });
});

test("explicit refusal stays explicit-no beside a frequent sponsor", () => {
  const company: Company = {
    key: normalizeCompanyName("GOOGLE LLC"),
    displayName: "GOOGLE LLC",
    likelihood: "frequent",
    records: [record(2024, 100)],
  };
  const result = verdict(
    { platform: "linkedin", companyName: "Google", description: "We do not sponsor." },
    company,
  );
  assert.equal(result.language.kind, "explicit-no");
  assert.deepEqual(result.company, {
    match: "matched",
    companyId: "google",
    likelihood: "frequent",
  });
});

function signedPack(mutate?: (body: SelectorPackBody) => void): unknown {
  const body: SelectorPackBody = {
    schema: 1,
    platform: "linkedin",
    version: 1,
    minExtensionVersion: "1.10.0",
    pages: [
      {
        kind: "search",
        detect: [".jobs-search-results__list-item"],
        slots: {
          jobTitle: [".job-details-jobs-unified-top-card__job-title h1"],
          companyName: [".job-details-jobs-unified-top-card__company-name a"],
          description: ["#job-details > div"],
          listingCompanyName: [".job-card-container__primary-description"],
          activeListing: [".jobs-search-results-list__list-item--active"],
        },
      },
    ],
  };
  mutate?.(body);
  return { ...body, contentHash: selectorPackContentHash(body) };
}

test("a signed selector pack parses", () => {
  const parsed = parseSelectorPack(signedPack());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.pack.platform, "linkedin");
  assert.equal(parsed.pack.pages[0]?.slots.companyName[0], ".job-details-jobs-unified-top-card__company-name a");
  assert.equal(parsed.pack.pages[0]?.slots.description[0], "#job-details > div");
});

test("a selector pack with a broken content hash is rejected", () => {
  const pack = signedPack() as { contentHash: string };
  pack.contentHash = "0".repeat(64);
  const parsed = parseSelectorPack(pack);
  assert.deepEqual(parsed, { ok: false, error: "content-hash" });
});

test("selectors that contain markup or url() are rejected", () => {
  const markup = parseSelectorPack(
    signedPack((body) => {
      body.pages[0]!.slots.companyName = ["div < span"];
    }),
  );
  const url = parseSelectorPack(
    signedPack((body) => {
      body.pages[0]!.slots.description = ["url(https://evil.example/p)"];
    }),
  );
  assert.deepEqual(markup, { ok: false, error: "forbidden-selector" });
  assert.deepEqual(url, { ok: false, error: "forbidden-selector" });
});
