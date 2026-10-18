import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseSelectorPack,
  selectorPackContentHash,
  type Platform,
  type SelectorPack,
  type SelectorPackBody,
} from "@visaspotter/domain";
import { acceptedPack, readSelectorPointer, selectorPublishPlan } from "../src/publish.ts";

function bundled(platform: Platform): Record<string, unknown> {
  const url = new URL(`../../selector-client/packs/${platform}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

async function bundledPacks(): Promise<Record<Platform, SelectorPack>> {
  return {
    linkedin: await acceptedPack(bundled("linkedin"), "linkedin"),
    indeed: await acceptedPack(bundled("indeed"), "indeed"),
  };
}

test("the pointer links content-addressed packs that parseSelectorPack accepts", async () => {
  const plan = selectorPublishPlan(await bundledPacks());
  const pointer = readSelectorPointer(JSON.parse(plan.pointer.body));
  assert.ok(pointer !== null, "pointer body reads back");
  assert.equal(plan.pointer.key, "v1/selectors/current.json");
  assert.equal(plan.pointer.cacheControl, "public, max-age=3600");

  const bodies = new Map(plan.packs.map((object) => [object.key, object]));
  for (const platform of ["linkedin", "indeed"] as const) {
    const object = bodies.get(pointer.packs[platform]);
    assert.ok(object !== undefined, `${platform} pointer target is in the plan`);
    assert.equal(object.cacheControl, "public, max-age=31536000, immutable");
    const parsed = await parseSelectorPack(JSON.parse(object.body));
    assert.ok(parsed.ok, `${platform} published body parses`);
    assert.equal(parsed.pack.platform, platform);
    assert.equal(object.key, `v1/selectors/${platform}/${parsed.pack.version}-${parsed.pack.contentHash}.json`);
  }
});

test("an edited pack publishes under a new key, and an unsigned edit is refused", async () => {
  const packs = await bundledPacks();
  const { contentHash, ...body } = bundled("indeed");
  (body.pages as { detect: string[] }[])[0]!.detect.push("[data-testid='jobsearch-JobCountAndSortPane']");
  await assert.rejects(acceptedPack({ ...body, contentHash }, "indeed"), /content-hash/);

  const resigned = { ...body, contentHash: await selectorPackContentHash(body as SelectorPackBody) };
  const before = selectorPublishPlan(packs);
  const after = selectorPublishPlan({ ...packs, indeed: await acceptedPack(resigned, "indeed") });
  assert.equal(after.packs[0]?.key, before.packs[0]?.key);
  assert.notEqual(after.packs[1]?.key, before.packs[1]?.key);
  assert.notEqual(after.pointer.body, before.pointer.body);
});

test("a pack signed for one board cannot be published as the other", async () => {
  await assert.rejects(acceptedPack(bundled("indeed"), "linkedin"), /names platform indeed/);
});

test("the dry run prints the keys and the pointer and does not call AWS", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "src/cli.ts", "--bucket", "visaspotter-dev-public-028658486564", "--dry-run"],
    { cwd: new URL("..", import.meta.url), encoding: "utf8", env: { ...process.env, PATH: "" } },
  );
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  assert.match(lines[0] ?? "", /^v1\/selectors\/linkedin\/1-[0-9a-f]{64}\.json$/);
  assert.match(lines[1] ?? "", /^v1\/selectors\/indeed\/1-[0-9a-f]{64}\.json$/);
  assert.equal(lines[2], "v1/selectors/current.json");
  assert.deepEqual(readSelectorPointer(JSON.parse(lines[3] ?? "")), JSON.parse(lines[3] ?? ""));
});
