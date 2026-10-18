import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { parseSelectorPack, selectorPackContentHash } from "../../packages/domain/src/selector-pack.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPTS = [
  "modules/contents/selectors.js",
  "modules/contents/parsingWorker.js",
  "modules/contents/page.js",
  "modules/contents/listing.js",
  "modules/contents/linkedin/linkedin.js",
  "modules/contents/indeed/indeed.js",
];

function bundledJson(platform) {
  return JSON.parse(readFileSync(join(root, `packages/selector-client/packs/${platform}.json`), "utf8"));
}

async function bundled(platform) {
  const parsed = await parseSelectorPack(bundledJson(platform));
  assert.equal(parsed.ok, true);
  return parsed.pack;
}

async function remote(platform, mutate) {
  const { contentHash: _previous, ...body } = bundledJson(platform);
  mutate(body);
  const parsed = await parseSelectorPack({ ...body, contentHash: await selectorPackContentHash(body) });
  assert.equal(parsed.ok, true);
  return parsed.pack;
}

function element(text = "", matches = {}) {
  return {
    innerText: text,
    style: {},
    anchor: null,
    clickListeners: [],
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      if (selector.startsWith("!")) throw new SyntaxError(`'${selector}' is not a valid selector`);
      return matches[selector] ?? [];
    },
    closest(selector) {
      return selector === "a" ? this.anchor : null;
    },
    addEventListener(type, listener) {
      if (type === "click") this.clickListeners.push(listener);
    },
  };
}

function page(pack, kind) {
  return pack.pages.find((candidate) => candidate.kind === kind);
}

function board(body) {
  const sent = [];
  const badges = [];
  const context = vm.createContext({
    document: { body },
    Messaging: class {
      constructor(message) {
        sent.push(JSON.parse(JSON.stringify(message.data)));
      }
    },
    CompanyBadge: class {
      constructor(container, status) {
        badges.push({ container, status });
      }
    },
  });
  vm.runInContext("var parsing = false;", context);
  for (const file of SCRIPTS) {
    vm.runInContext(readFileSync(join(root, file), "utf8"), context, { filename: file });
  }
  return {
    sent,
    badges,
    worker: (name) => new (vm.runInContext(name, context))(),
  };
}

function linkedinSearchBody(pack, { companyName = "Google LLC", companySelector } = {}) {
  const search = page(pack, "search");
  const google = element("Google LLC");
  const acme = element(" Acme Corp ");
  const badged = element("Badged Inc", { svg: [element()] });
  const title = element("Software Engineer");
  title.anchor = element();
  return {
    google,
    acme,
    title,
    body: element("", {
      [search.detect[0]]: [element()],
      [search.slots.listingCompanyName[0]]: [google, badged, acme],
      [search.slots.activeListing[0]]: [element("", { [search.slots.listingCompanyName[0]]: [acme] })],
      [companySelector ?? search.slots.companyName[0]]: companyName === null ? [] : [element(` ${companyName} `)],
      [search.slots.description[0]]: [element("We sponsor H-1B visas.")],
      [search.slots.jobTitle[0]]: [title],
    }),
  };
}

test("LinkedIn search decorates the cards and detail pane the bundled pack names", async () => {
  const pack = await bundled("linkedin");
  const dom = linkedinSearchBody(pack);
  const linkedin = board(dom.body);
  const worker = linkedin.worker("LinkedinWorker");
  worker.set_method(pack);

  assert.deepEqual(linkedin.sent, [
    { posts: true, content: [{ name: "Google LLC", index: 0 }, { name: "Acme Corp", index: 1 }] },
    { description: true, content: "We sponsor H-1B visas." },
    { name: true, content: "Google LLC" },
  ]);
  worker.add_listing_badge({ mark: "sponsor" }, 1);
  assert.equal(linkedin.badges[0].container, dom.acme);
  assert.equal(dom.title.anchor.clickListeners.length, 1, "badge clicks do not follow the title link");
});

test("LinkedIn search falls back to the active card's company when the detail pane has none", async () => {
  const pack = await bundled("linkedin");
  const linkedin = board(linkedinSearchBody(pack, { companyName: null }).body);
  linkedin.worker("LinkedinWorker").set_method(pack);
  assert.deepEqual(linkedin.sent.at(-1), { name: true, content: "Acme Corp" });
});

test("a remote LinkedIn pack moves company name lookup to its next valid candidate", async () => {
  const pack = await remote("linkedin", (body) => {
    body.version = 2;
    body.pages[0].slots.companyName = ["!not a selector", ".gone", ".remote-company"];
  });
  const linkedin = board(linkedinSearchBody(pack, { companyName: "Remote Co", companySelector: ".remote-company" }).body);
  linkedin.worker("LinkedinWorker").set_method(pack);
  assert.deepEqual(linkedin.sent.at(-1), { name: true, content: "Remote Co" });
});

test("LinkedIn job view reads the job page slots and sends no listing", async () => {
  const pack = await bundled("linkedin");
  const job = page(pack, "job");
  const linkedin = board(
    element("", {
      [job.detect[0]]: [element()],
      [job.slots.companyName[0]]: [element("Stripe")],
      [job.slots.description[0]]: [element("No visa sponsorship.")],
      [job.slots.jobTitle[0]]: [element("Engineer")],
    }),
  );
  linkedin.worker("LinkedinWorker").set_method(pack);
  assert.deepEqual(linkedin.sent, [
    { description: true, content: "No visa sponsorship." },
    { name: true, content: "Stripe" },
  ]);
});

test("Indeed search decorates the result cards and the detail pane", async () => {
  const pack = await bundled("indeed");
  const search = page(pack, "search");
  const indeed = board(
    element("", {
      [search.detect[0]]: [element()],
      [search.slots.listingCompanyName[0]]: [element("Amazon"), element("Meta")],
      [search.slots.companyName[0]]: [element("Amazon")],
      [search.slots.description[0]]: [element("Sponsorship available.")],
    }),
  );
  indeed.worker("IndeedWorker").set_method(pack);
  assert.deepEqual(indeed.sent, [
    { posts: true, content: [{ name: "Amazon", index: 0 }, { name: "Meta", index: 1 }] },
    { description: true, content: "Sponsorship available." },
    { name: true, content: "Amazon" },
  ]);
});

test("an Indeed company jobs page reads the job slots and lays out its badges inline", async () => {
  const pack = await bundled("indeed");
  const job = page(pack, "job");
  const name = element("Microsoft");
  const title = element("Program Manager");
  const indeed = board(
    element("", {
      [job.detect[1]]: [element()],
      [job.slots.companyName[0]]: [name],
      [job.slots.description[0]]: [element("We sponsor.")],
      [job.slots.jobTitle[0]]: [title],
    }),
  );
  indeed.worker("IndeedWorker").set_method(pack);
  assert.deepEqual(indeed.sent, [
    { description: true, content: "We sponsor." },
    { name: true, content: "Microsoft" },
  ]);
  assert.equal(name.style.display, "flex");
  assert.equal(title.style.display, "flex");
});

test("a page no pack recognizes, or a missing pack, sends nothing", async () => {
  const pack = await bundled("indeed");
  const unknown = board(element("", { ".something-else": [element()] }));
  unknown.worker("IndeedWorker").set_method(pack);
  unknown.worker("LinkedinWorker").set_method(null);
  assert.deepEqual(unknown.sent, []);
});
