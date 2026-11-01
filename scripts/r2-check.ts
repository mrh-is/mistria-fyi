// Confirms the R2 upload token can write the asset bucket: puts a small probe object under tmp/,
// then deletes it. A real upload doesn't prove this, because it skips every object that is already
// current and so may never call Wrangler. Reads the token like the upload scripts do, from the
// environment or `.env.r2-upload`, and never prints it.
//
//   pnpm run r2:check   (R2_BUCKET overrides the bucket)
import "#scripts/lib/require-pinned-node";

import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadR2UploadEnvFile, r2UploadOptionsFromEnv, runWrangler } from "#scripts/lib/r2-upload";

import type { WranglerResult } from "#scripts/lib/r2-upload";

export async function checkR2Upload(
  run: (args: string[]) => Promise<WranglerResult> = runWrangler,
): Promise<number> {
  const options = r2UploadOptionsFromEnv();
  if (!options.hasUploadToken) {
    console.error(
      "R2_UPLOAD_TOKEN is not set in the environment or .env.r2-upload. Set it up per docs/machine-setup.md (R2 upload token).",
    );
    return 1;
  }
  const dir = await mkdtemp(path.join(tmpdir(), "r2-check-"));
  const file = path.join(dir, "probe.txt");
  const target = `${options.bucket}/tmp/r2-check-${randomUUID()}.txt`;
  try {
    await writeFile(file, "probe\n");
    const put = await run(["r2", "object", "put", target, "--remote", "--file", file]);
    // Delete even after a failed put, which may have written the object before failing.
    const removed = await run(["r2", "object", "delete", target, "--remote"]);
    if (!put.ok) {
      console.error(`Could not put ${target}:\n${put.output}`);
      if (!removed.ok) {
        console.error(`If ${target} exists, remove it by hand.`);
      }
      return 1;
    }
    if (!removed.ok) {
      console.error(`Put ${target} but could not delete it; remove it by hand:\n${removed.output}`);
      return 1;
    }
    console.log(`The R2 upload token can write ${options.bucket}.`);
    return 0;
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await loadR2UploadEnvFile();
  process.exitCode = await checkR2Upload();
}
