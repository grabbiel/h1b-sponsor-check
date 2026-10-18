import { parseArgs } from "node:util";
import { POINTER_CACHE_CONTROL } from "@visaspotter/index-builder/publish";
import { acceptedPack, packObjectKey, PLATFORMS, readSelectorPointer, SELECTOR_POINTER_KEY } from "./publish.ts";

const { values } = parseArgs({ options: { "base-url": { type: "string" } } });
const baseUrl = values["base-url"];

if (baseUrl === undefined) {
  process.stderr.write("Usage: node --experimental-strip-types packages/selector-publish/src/verify.ts --base-url <https://host>\n");
  process.exit(1);
}

try {
  const pointerResponse = await get(`${baseUrl}/${SELECTOR_POINTER_KEY}`);
  const cacheControl = pointerResponse.headers.get("cache-control");
  if (cacheControl !== POINTER_CACHE_CONTROL) {
    throw new Error(`${SELECTOR_POINTER_KEY} cache-control is ${cacheControl}, expected ${POINTER_CACHE_CONTROL}`);
  }
  const pointer = readSelectorPointer(await pointerResponse.json());
  if (pointer === null) throw new Error(`${SELECTOR_POINTER_KEY} is not a selector pointer`);
  process.stdout.write(`${SELECTOR_POINTER_KEY} 200 cache-control=${cacheControl}\n`);
  for (const platform of PLATFORMS) {
    const key = pointer.packs[platform];
    const pack = await acceptedPack(await (await get(`${baseUrl}/${key}`)).json(), platform);
    if (packObjectKey(pack) !== key) throw new Error(`${key} holds pack ${packObjectKey(pack)}`);
    process.stdout.write(`${key} 200 parsed version=${pack.version} pages=${pack.pages.length}\n`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function get(url: string): Promise<Response> {
  const response = await fetch(url);
  if (response.status !== 200) throw new Error(`GET ${url} returned ${response.status}`);
  return response;
}
