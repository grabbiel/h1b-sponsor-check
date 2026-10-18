import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseSelectorPack, selectorPackContentHash, type SelectorPack, type SelectorPackBody } from "../../domain/src/index.ts";
import { memoryIndexStore } from "../../index-client/src/store.js";
import { createSelectorPackClient, selectorPackRequest } from "../src/client.js";

const DAY = 24 * 60 * 60 * 1000;
const REMOTE = "https://packs.test";
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
      remoteUrl: remote ? (platform: string) => `${REMOTE}/v1/selectors/${platform}.json` : null,
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

const linkedinUrl = `${REMOTE}/v1/selectors/linkedin.json`;

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

test("without a remote URL the bundled pack is served and nothing is fetched", async () => {
  const world = worldFor({});
  const pack = await world.client(false).pack("linkedin");
  assert.equal(pack?.contentHash, bundledJson("linkedin").contentHash);
  assert.deepEqual(world.fetched, []);
});

test("an unknown board gets no pack", async () => {
  const world = worldFor({});
  assert.equal(await world.client().pack("glassdoor"), null);
});

test("a newer remote pack replaces the bundled one and is fetched at most once a day", async () => {
  const remote = await signed("linkedin", (body) => {
    body.version = 2;
    body.pages[0]!.slots.companyName = [".remote-company"];
  });
  const world = worldFor({ [linkedinUrl]: reply(remote) });

  const first = await world.client().pack("linkedin");
  assert.equal(first?.version, 2);
  assert.deepEqual(first?.pages[0]?.slots.companyName, [".remote-company"]);

  world.advance(DAY - 1);
  const restarted = await world.client().pack("linkedin");
  assert.equal(restarted?.version, 2, "a fresh service worker reuses the stored pack");
  assert.equal(world.fetched.length, 1);

  world.advance(1);
  await world.client().pack("linkedin");
  assert.equal(world.fetched.length, 2);
});

test("concurrent requests share one refresh", async () => {
  const remote = await signed("linkedin", (body) => {
    body.version = 2;
  });
  const world = worldFor({ [linkedinUrl]: reply(remote) });
  const client = world.client();
  const [a, b] = await Promise.all([client.pack("linkedin"), client.pack("linkedin")]);
  assert.equal(a?.version, 2);
  assert.equal(b?.version, 2);
  assert.equal(world.fetched.length, 1);
});

const badRemotes: Array<[string, () => Promise<Reply>]> = [
  ["a network failure", async () => "throw"],
  ["a 403 from CloudFront", async () => reply("denied", 403)],
  ["a body that is not JSON", async () => reply("<html>")],
  [
    "a broken content hash",
    async () => {
      const pack = await signed("linkedin", (body) => {
        body.version = 2;
      });
      return reply({ ...pack, contentHash: "0".repeat(64) });
    },
  ],
  [
    "a forbidden selector",
    async () =>
      reply(
        await signed("linkedin", (body) => {
          body.version = 2;
          body.pages[0]!.slots.description = ["url(https://evil.example/p)"];
        }),
      ),
  ],
  [
    "another board's pack",
    async () =>
      reply(
        await signed("indeed", (body) => {
          body.version = 2;
        }),
      ),
  ],
  [
    "a pack for a newer extension",
    async () =>
      reply(
        await signed("linkedin", (body) => {
          body.version = 2;
          body.minExtensionVersion = "1.9.0";
        }),
      ),
  ],
  ["a pack no newer than the bundle", async () => reply(await signed("linkedin", () => {}))],
];

for (const [label, makeReply] of badRemotes) {
  test(`${label} falls back to the bundled pack and waits a day to retry`, async () => {
    const world = worldFor({ [linkedinUrl]: await makeReply() });
    const pack = await world.client().pack("linkedin");
    assert.equal(pack?.contentHash, bundledJson("linkedin").contentHash);
    world.advance(DAY - 1);
    await world.client().pack("linkedin");
    assert.equal(world.fetched.length, 1);
  });
}

test("a failed refresh keeps the last good remote pack", async () => {
  const remote = await signed("linkedin", (body) => {
    body.version = 3;
  });
  const replies: Record<string, Reply> = { [linkedinUrl]: reply(remote) };
  const world = worldFor(replies);
  assert.equal((await world.client().pack("linkedin"))?.version, 3);

  replies[linkedinUrl] = reply("gone", 500);
  world.advance(DAY);
  assert.equal((await world.client().pack("linkedin"))?.version, 3);
  assert.equal(world.fetched.length, 2);
});
