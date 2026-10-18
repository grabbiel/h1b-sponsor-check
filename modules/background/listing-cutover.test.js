import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  companyBadgeForName,
  companyBadgeFromLookup,
  popupSummary,
  postingBadgeFromDescription,
} from "./listing-cutover.js";
import Content from "./messaging/content.js";
import PostingInformation from "./posting.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const LINKEDIN = 1;
const INDEED = 2;
const GLASSDOOR = 3;

function stubBrowser(t) {
  const sent = [];
  const fetched = [];
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { tabs: { sendMessage: (tabId, message) => sent.push(message.data) } };
  t.mock.method(globalThis, "fetch", async (url) => {
    fetched.push(String(url));
    return new Response(JSON.stringify({ cstatus: 1 }));
  });
  t.after(() => {
    globalThis.chrome = previousChrome;
  });
  return { sent, fetched };
}

async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function submitCompanyName(posting, name, lookup) {
  new Content(7, posting, { operation: "submit", data: { name: true, content: name } }, () => {}, lookup);
}

for (const [board, platform] of [["LinkedIn", LINKEDIN], ["Indeed", INDEED]]) {
  test(`${board} company detail uses the index and never the PHP match`, async (t) => {
    const { sent, fetched } = stubBrowser(t);
    const posting = new PostingInformation();
    posting.setPlatform(platform);
    const looked = [];
    submitCompanyName(posting, "Google LLC", async (name) => {
      looked.push(name);
      return {
        match: "matched",
        company: { key: "google", displayName: "Google", likelihood: "frequent", records: [] },
        rankBand: "top",
      };
    });
    await settle();
    assert.deepEqual(looked, ["Google LLC"]);
    assert.deepEqual(fetched, []);
    const badge = { mark: "sponsor", likelihood: "frequent", rankBand: "top", label: "frequent, rank top" };
    assert.deepEqual(sent, [{ cstatus: true, content: badge }]);
    assert.deepEqual(posting.companyBadge, badge);
  });
}

test("Glassdoor company detail keeps the PHP match", async (t) => {
  const { sent, fetched } = stubBrowser(t);
  const posting = new PostingInformation();
  posting.setPlatform(GLASSDOOR);
  const looked = [];
  submitCompanyName(posting, "Google", async (name) => {
    looked.push(name);
    return { match: "unmatched", companyId: null, likelihood: "unknown" };
  });
  await settle();
  assert.deepEqual(looked, []);
  assert.ok(fetched.some((url) => url.endsWith("h1brecords/company_has_match.php")), fetched.join(","));
  assert.equal(sent[0].content.mark, "sponsor");
  assert.equal(posting.companyBadge, null);
});

test("listing cards get index badges through the lookup Content was given", async (t) => {
  const { sent, fetched } = stubBrowser(t);
  const posting = new PostingInformation();
  const posts = [{ name: "Google", index: 0 }, { name: "Nobody Inc", index: 1 }];
  new Content(7, posting, { operation: "submit", data: { posts: true, content: posts } }, () => {}, async (name) =>
    name === "Google"
      ? {
          match: "matched",
          company: { key: "google", displayName: "Google", likelihood: "rare", records: [] },
          rankBand: "mid",
        }
      : { match: "unmatched", companyId: null, likelihood: "unknown" },
  );
  await settle();
  assert.deepEqual(fetched, []);
  const marks = Object.fromEntries(sent.map((data) => [data.content.index, data.content.cstatus.mark]));
  assert.deepEqual(marks, { 0: "sponsor", 1: "no-record" });
});

test("a description with an explicit refusal makes the posting unfriendly", () => {
  const posting = new PostingInformation();
  posting.setDescription("Visa sponsorship details below. We will not sponsor H-1B.");
  assert.equal(posting.postIsFriendly, 0);
  posting.setDescription("We offer H-1B sponsorship.");
  assert.equal(posting.postIsFriendly, 1);
});

test("an empty description is Sponsor", () => {
  assert.deepEqual(postingBadgeFromDescription(""), { mark: "sponsor", label: "Sponsor" });
  assert.deepEqual(postingBadgeFromDescription("visa sponsorship is available"), {
    mark: "sponsor",
    label: "Sponsor",
  });
});

test("an explicit refusal is NoSponsor", () => {
  assert.deepEqual(postingBadgeFromDescription("We do not sponsor H-1B visas."), {
    mark: "no-sponsor",
    label: "NoSponsor",
  });
});

test("a matched company badge keeps likelihood and rankBand", () => {
  assert.deepEqual(
    companyBadgeFromLookup({
      match: "matched",
      company: { key: "google", displayName: "Google", likelihood: "frequent", records: [] },
      rankBand: "top",
    }),
    { mark: "sponsor", likelihood: "frequent", rankBand: "top", label: "frequent, rank top" },
  );
});

test("a matched company with no approvals is not a missing record", () => {
  assert.deepEqual(
    companyBadgeFromLookup({
      match: "matched",
      company: { key: "acme", displayName: "Acme", likelihood: "none", records: [] },
      rankBand: "none",
    }),
    { mark: "no-sponsor", likelihood: "none", rankBand: "none", label: "none, rank none" },
  );
});

test("an unmatched name is a no-record badge and does not fall back", async () => {
  const calls = [];
  const badge = await companyBadgeForName("Amazon", async (name) => {
    calls.push(name);
    return { match: "unmatched", companyId: null, likelihood: "unknown" };
  });
  assert.deepEqual(calls, ["Amazon"]);
  assert.deepEqual(badge, {
    mark: "no-record",
    likelihood: "unknown",
    rankBand: null,
    label: "No record",
  });
});

test("a lookup failure is a no-record badge", async () => {
  const badge = await companyBadgeForName("Google", async () => {
    throw new Error("index down");
  });
  assert.equal(badge.mark, "no-record");
  assert.equal(badge.likelihood, "unknown");
});

test("the popup states Sponsor or NoSponsor and the index result", () => {
  assert.equal(
    popupSummary("Google", { label: "Sponsor" }, { mark: "sponsor", likelihood: "frequent", rankBand: "top" }),
    "Sponsor. Google likelihood frequent, rank top.",
  );
  assert.equal(
    popupSummary("Acme <x>", { label: "NoSponsor" }, { mark: "no-record" }),
    "NoSponsor. No H-1B record for Acme &lt;x&gt;.",
  );
});

test("LinkedIn and Indeed decoration does not call the PHP company match", () => {
  const files = [
    "modules/background/listing.js",
    "modules/background/messaging/content.js",
    "modules/background/posting.js",
    "modules/contents/listing.js",
    "modules/contents/page.js",
    "modules/contents/selectors.js",
    "modules/contents/linkedin/linkedin.js",
    "modules/contents/indeed/indeed.js",
    "modules/badges/company.js",
    "modules/badges/position.js",
  ];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    assert.equal(text.includes("company_has_match"), false, file);
    assert.equal(text.includes("visaspotter.com"), false, file);
  }
});
