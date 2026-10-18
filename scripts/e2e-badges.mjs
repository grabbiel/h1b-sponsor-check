import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { companyBadgeForName } from "../modules/background/listing-cutover.js";
import { INDEX_BASE, createIndexClient } from "../packages/index-client/src/client.js";
import { memoryIndexStore } from "../packages/index-client/src/store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? join(tmpdir(), "visaspotter-e2e");
const query = "software engineer google";
const SPONSOR_FILL = "#0FFF00";
mkdirSync(out, { recursive: true });

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "visaspotter-profile-")), {
  channel: "chromium",
  headless: process.env.HEADLESS === "1",
  viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
console.log(`extension ${worker.url()}`);

const index = createIndexClient({ baseUrl: INDEX_BASE, store: memoryIndexStore() });
const failures = [];

const linkedinSearch = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(query)}&location=United%20States`;
const linkedinJob = await check("linkedin-search", linkedinSearch, (page) =>
  page.$eval(".base-card__full-link", (link) => link.href.split("?")[0]).catch(() => null),
);
if (linkedinJob === null) failures.push("linkedin-search listed no job to open");
else await check("linkedin-job", linkedinJob);
await check("indeed-search", `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}`);
await check("indeed-company-jobs", "https://www.indeed.com/cmp/Google/jobs");

await context.close();
if (failures.length > 0) {
  console.error(`FAIL ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`PASS screenshots in ${out}`);

async function check(name, url, after) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const badges = await waitForBadges(page);
  const shot = join(out, `${name}.png`);
  await page.screenshot({ path: shot });
  if (badges.length === 0) failures.push(`${name} drew no company badge at ${page.url()}`);

  const expected = new Map();
  for (const company of new Set(badges.map((badge) => badge.company))) {
    expected.set(company, await companyBadgeForName(company, index.lookup));
  }
  const rows = badges.map(({ company, fill }) => {
    const want = expected.get(company);
    const drawn = fill?.toUpperCase() === SPONSOR_FILL ? "sponsor" : "not-sponsor";
    const wantDrawn = want.mark === "sponsor" ? "sponsor" : "not-sponsor";
    if (drawn !== wantDrawn) failures.push(`${name} drew ${drawn} for ${company}, index says ${want.mark}`);
    return { company, drawn, badge: want };
  });
  const summary = Object.values(
    Object.groupBy(rows, (row) => `${row.company}|${row.drawn}`),
  ).map((group) => ({ ...group[0], count: group.length }));
  console.log(JSON.stringify({ page: name, url: page.url(), badges: badges.length, screenshot: shot, summary }, null, 2));
  const next = after === undefined ? undefined : await after(page);
  await page.close();
  return next;
}

async function waitForBadges(page) {
  let last = [];
  for (let attempt = 0; attempt < 15; attempt++) {
    await page.waitForTimeout(2000);
    const badges = await page.$$eval("svg[viewBox='0 0 18 18']", (svgs) =>
      svgs.map((svg) => ({
        company: svg.parentElement.innerText.trim(),
        fill: svg.querySelector("path")?.getAttribute("fill"),
      })),
    );
    if (badges.length > 0 && badges.length === last.length) return badges;
    last = badges;
  }
  return last;
}
