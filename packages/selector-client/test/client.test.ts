import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseSelectorPack, selectorPackContentHash, type SelectorPack, type SelectorPackBody } from "../../domain/src/index.ts";
import { memoryIndexStore } from "../../index-client/src/store.js";
import { createSelectorPackClient, selectorPackRequest } from "../src/client.js";

const DAY = 24 * 60 * 60 * 1000;
const REMOTE = "https://packs.test";
const POINTER_URL = `${REMOTE}/v1/selectors/current.json`;
const EXTENSION_VERSION = "1.8.1";

function bundledJson(platform: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`../packs/${platform}.json`, import.meta.url), "utf8"));
}

async function signed(platform: string, mutate: (body: SelectorPackBody) => void): Promise<Record<string, unknown>> {
  const { contentHash: _previous, ...body } = bundledJson(platform) as SelectorPack;
  mutate(body);
  return { ...body, contentHash: await selectorPackContentHash(body) };
}

type Reply = { status: number; body: string } | "throw";

function worldFor(replies: Record<string, Reply>, store = memoryIndexStore()) {
  let clock = Date.UTC(2026, 9, 18, 12);
  const fetched: string[] = [];
  const client = (remote = true) =>
    createSelectorPackClient({
      loadBundled: async (platform: string) => bundledJson(platform),
      pointerUrl: remote ? POINTER_URL : null,
      extensionVersion: EXTENSION_VERSION,
      store,
      now: () => clock,
      fetch: async (url: string) => {
        fetched.push(url);
        const reply = replies[url];
        if (reply === undefined || reply === "throw") throw new Error("offline");
        return new Response(reply.body, { status: reply.status });
      },
    });
  return {
    client,
    fetched,
    advance(ms: number) {
      clock += ms;
    },
  };
}

function reply(body: unknown, status = 200): Reply {
  return { status, body: typeof body === "string" ? body : JSON.stringify(body) };
}

function keyFor(pack: Record<string, unknown>): string {
  return `v1/selectors/${pack.platform}/${pack.version}-${pack.contentHash}.json`;
}

function published(...packs: Array<Record<string, unknown>>): Record<string, Reply> {
  const keys = Object.fromEntries(packs.map((pack) => [pack.platform, keyFor(pack)]));
  return {
    [POINTER_URL]: reply({ schema: 1, packs: keys }),
    ...Object.fromEntries(packs.map((pack) => [`${REMOTE}/${keyFor(pack)}`, reply(pack)])),
  };
}

function newer(platform: string, version = 2) {
  return signed(platform, (body) => {
    body.version = version;
  });
}

test("the bundled LinkedIn and Indeed packs parse and cover search and job pages", async () => {
  for (const platform of ["linkedin", "indeed"]) {
    const parsed = await parseSelectorPack(bundledJson(platform));
    assert.equal(parsed.ok, true, `${platform} pack must parse; run npm run sign -w @visaspotter/selector-client`);
    if (!parsed.ok) return;
    assert.equal(parsed.pack.platform, platform);
    assert.equal(parsed.pack.minExtensionVersion, EXTENSION_VERSION);
    assert.deepEqual(
      parsed.pack.pages.map((page) => page.kind),
      ["search", "job"],
    );
  }
});

test("content messages name the board whose pack they need", () => {
  assert.equal(selectorPackRequest({ origin: "content", operation: "selector-pack", platform: "indeed" }), "indeed");
  assert.equal(selectorPackRequest({ origin: "content", operation: "selector-pack", platform: "glassdoor" }), null);
  assert.equal(selectorPackRequest({ origin: "popup", operation: "selector-pack", platform: "linkedin" }), null);
  assert.equal(selectorPackRequest(null), null);
});

test("without a pointer URL the bundled pack is served and nothing is fetched", async () => {
  const world = worldFor({});
  const pack = await world.client(false).pack("linkedin");
  assert.equal(pack?.contentHash, bundledJson("linkedin").contentHash);
  assert.deepEqual(world.fetched, []);
});

test("an unknown board gets no pack", async () => {
  const world = worldFor({});
  assert.equal(await world.client().pack("glassdoor"), null);
});

test("the pointer leads to each board's newer pack, and both are fetched at most once a day", async () => {
  const linkedin = await signed("linkedin", (body) => {
    body.version = 2;
    body.pages[0]!.slots.companyName = [".remote-company"];
  });
  const indeed = await newer("indeed", 4);
  const world = worldFor(published(linkedin, indeed));

  const first = await world.client().pack("linkedin");
  assert.equal(first?.version, 2);
  assert.deepEqual(first?.pages[0]?.slots.companyName, [".remote-company"]);
  assert.equal((await world.client().pack("indeed"))?.version, 4);
  assert.deepEqual(world.fetched.sort(), [POINTER_URL, `${REMOTE}/${keyFor(indeed)}`, `${REMOTE}/${keyFor(linkedin)}`].sort());

  world.advance(DAY - 1);
  const restarted = await world.client().pack("linkedin");
  assert.equal(restarted?.version, 2, "a fresh service worker reuses the stored pack");
  assert.equal(world.fetched.length, 3);

  world.advance(1);
  await world.client().pack("linkedin");
  assert.equal(world.fetched.filter((url) => url === POINTER_URL).length, 2);
});

test("concurrent requests for both boards share one pointer fetch", async () => {
  const world = worldFor(published(await newer("linkedin"), await newer("indeed")));
  const client = world.client();
  const [a, b, c] = await Promise.all([client.pack("linkedin"), client.pack("indeed"), client.pack("linkedin")]);
  assert.equal(a?.version, 2);
  assert.equal(b?.version, 2);
  assert.equal(c?.version, 2);
  assert.equal(world.fetched.filter((url) => url === POINTER_URL).length, 1);
  assert.equal(world.fetched.length, 3);
});

test("a pointer that omits a board keeps that board on its bundle", async () => {
  const world = worldFor(published(await newer("linkedin")));
  assert.equal((await world.client().pack("linkedin"))?.version, 2);
  assert.equal((await world.client().pack("indeed"))?.contentHash, bundledJson("indeed").contentHash);
});

const badPointers: Array<[string, () => Promise<Record<string, Reply>>]> = [
  ["an unreachable pointer", async () => ({})],
  ["a 403 pointer", async () => ({ [POINTER_URL]: reply("denied", 403) })],
  ["a pointer that is not JSON", async () => ({ [POINTER_URL]: reply("<html>") })],
  [
    "a pointer with an unknown schema",
    async () => {
      const replies = published(await newer("linkedin"));
      return { ...replies, [POINTER_URL]: reply({ schema: 2, packs: { linkedin: keyFor(await newer("linkedin")) } }) };
    },
  ],
  [
    "a pointer missing the board key",
    async () => {
      const indeed = await newer("indeed");
      return { ...published(indeed), [POINTER_URL]: reply({ schema: 1, packs: { indeed: keyFor(indeed) } }) };
    },
  ],
  [
    "a pointer naming another board's key",
    async () => {
      const indeed = await newer("indeed");
      return { ...published(indeed), [POINTER_URL]: reply({ schema: 1, packs: { linkedin: keyFor(indeed) } }) };
    },
  ],
  [
    "a pointer naming an off-origin URL",
    async () => ({ [POINTER_URL]: reply({ schema: 1, packs: { linkedin: "https://evil.example/v1/selectors/linkedin/2.json" } }) }),
  ],
];

const linkedinPackReply = (makeReply: () => Promise<Reply>) => async () => {
  const pointed = await newer("linkedin");
  return { ...published(pointed), [`${REMOTE}/${keyFor(pointed)}`]: await makeReply() };
};

const badPacks: Array<[string, () => Promise<Record<string, Reply>>]> = [
  ["an unreachable pack", linkedinPackReply(async () => "throw")],
  ["a 403 pack from CloudFront", linkedinPackReply(async () => reply("denied", 403))],
  ["a pack that is not JSON", linkedinPackReply(async () => reply("<html>"))],
  [
    "a pack with a broken content hash",
    linkedinPackReply(async () => reply({ ...(await newer("linkedin")), contentHash: "0".repeat(64) })),
  ],
  [
    "a pack with a forbidden selector",
    linkedinPackReply(async () =>
      reply(
        await signed("linkedin", (body) => {
          body.version = 2;
          body.pages[0]!.slots.description = ["url(https://evil.example/p)"];
        }),
      ),
    ),
  ],
  ["another board's pack", linkedinPackReply(async () => reply(await newer("indeed")))],
  [
    "a pack for a newer extension",
    linkedinPackReply(async () =>
      reply(
        await signed("linkedin", (body) => {
          body.version = 2;
          body.minExtensionVersion = "1.9.0";
        }),
      ),
    ),
  ],
  [
    "a pack no newer than the bundle",
    async () =>
      published(
        await signed("linkedin", (body) => {
          body.pages[0]!.slots.companyName = [".same-version"];
        }),
      ),
  ],
];

for (const [label, makeReplies] of [...badPointers, ...badPacks]) {
  test(`${label} falls back to the bundled pack and waits a day to retry`, async () => {
    const world = worldFor(await makeReplies());
    const pack = await world.client().pack("linkedin");
    assert.equal(pack?.contentHash, bundledJson("linkedin").contentHash);
    const fetchedOnce = world.fetched.length;
    assert.ok(fetchedOnce >= 1, "the pointer was requested");
    world.advance(DAY - 1);
    await world.client().pack("linkedin");
    assert.equal(world.fetched.length, fetchedOnce);
  });
}

test("a pointer naming another board's key never fetches that key for this board", async () => {
  const indeed = await newer("indeed");
  const world = worldFor({ ...published(indeed), [POINTER_URL]: reply({ schema: 1, packs: { linkedin: keyFor(indeed) } }) });
  await world.client().pack("linkedin");
  assert.deepEqual(world.fetched, [POINTER_URL]);
});

test("a failed refresh keeps the last good remote pack", async () => {
  const replies = published(await newer("linkedin", 3));
  const world = worldFor(replies);
  assert.equal((await world.client().pack("linkedin"))?.version, 3);

  replies[POINTER_URL] = reply("gone", 500);
  world.advance(DAY);
  assert.equal((await world.client().pack("linkedin"))?.version, 3);
  assert.equal(world.fetched.filter((url) => url === POINTER_URL).length, 2);
});
