import { INDEX_BASE, createIndexClient } from "./client.js";
import { memoryIndexStore } from "./store.js";

const names = process.argv.slice(2);
if (names.length === 0) {
  process.stderr.write("Usage: node src/probe.js <company name>...\n");
  process.exit(1);
}

const client = createIndexClient({ baseUrl: INDEX_BASE, store: memoryIndexStore() });
for (const name of names) {
  const result = await client.lookup(name);
  process.stdout.write(`${JSON.stringify({ name, result })}\n`);
}
