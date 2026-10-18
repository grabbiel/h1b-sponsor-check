export const SHARD_COUNT = 256;

export function fnv1a32(text) {
  const bytes = new TextEncoder().encode(text);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function shardIndex(key) {
  const token = key.split(" ")[0] ?? "";
  return fnv1a32(token) % SHARD_COUNT;
}
