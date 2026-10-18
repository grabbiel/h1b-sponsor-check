import type { CompanyKey } from "./types.ts";
import { normalizeCompanyName as normalizeRaw, NORMALIZER_VERSION } from "./normalize.js";

export { NORMALIZER_VERSION };

export function normalizeCompanyName(raw: string): CompanyKey {
  return normalizeRaw(raw) as CompanyKey;
}
