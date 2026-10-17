import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildIndex, formatReport, writeShards } from "./build.ts";

const csvPath = argument("--csv");
const outDir = argument("--out");

if (csvPath === undefined || outDir === undefined) {
  process.stderr.write(
    [
      "Usage: node --experimental-strip-types packages/index-builder/src/cli.ts --csv <file> --out <dir>",
      "Reads one USCIS H-1B Employer Data Hub CSV.",
      "Required columns are Fiscal Year, Employer, Initial Approval, Initial Denial, Continuing Approval, and Continuing Denial.",
      "Put downloaded files in data/raw/. That directory is gitignored.",
      "Example file: https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-2023.csv",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

try {
  const csvText = readFileSync(csvPath, "utf8");
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const digest = createHash("sha256").update(csvText).digest("hex").slice(0, 8);
  const indexVersion = `idx-${day}-${digest}`;
  const built = buildIndex(csvText, indexVersion);
  writeShards(outDir, built.shards);
  process.stdout.write(`${formatReport(built.report)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function argument(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}
