import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ObjectPut } from "./publish.ts";

export function runAws(args: string[]): void {
  const result = spawnSync("aws", ["--no-cli-pager", ...args], {
    encoding: "utf8",
    env: { ...process.env, AWS_PAGER: "" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr}${result.stdout}`.trim();
    throw new Error(detail || `aws exited ${result.status}`);
  }
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
}

export function putObjects(bucket: string, objects: readonly ObjectPut[]): void {
  const dir = mkdtempSync(join(tmpdir(), "visaspotter-put-"));
  try {
    const file = join(dir, "body.json");
    for (const object of objects) {
      writeFileSync(file, object.body);
      runAws([
        "s3api",
        "put-object",
        "--bucket",
        bucket,
        "--key",
        object.key,
        "--body",
        file,
        "--content-type",
        object.contentType,
        "--cache-control",
        object.cacheControl,
      ]);
      process.stdout.write(`put s3://${bucket}/${object.key}\n`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function invalidate(distributionId: string, objects: readonly ObjectPut[]): void {
  runAws([
    "cloudfront",
    "create-invalidation",
    "--distribution-id",
    distributionId,
    "--paths",
    ...objects.map((object) => `/${object.key}`),
  ]);
}

export function checkBucketName(name: string): void {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)) throw new Error(`bucket ${name} is not a bucket name`);
}

export function checkDistributionId(id: string): void {
  if (!/^E[A-Z0-9]+$/.test(id)) throw new Error(`distribution ${id} is not a distribution id`);
}
