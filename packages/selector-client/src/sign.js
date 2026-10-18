import { readFileSync, writeFileSync } from "node:fs";
import { selectorPackContentHash } from "../../domain/src/selector-pack.js";

for (const path of process.argv.slice(2)) {
  const { contentHash: _previous, ...body } = JSON.parse(readFileSync(path, "utf8"));
  const signed = { ...body, contentHash: await selectorPackContentHash(body) };
  writeFileSync(path, `${JSON.stringify(signed, null, 2)}\n`);
  process.stdout.write(`${path} ${signed.contentHash}\n`);
}
