// Moves the real `.sav` fixtures between the shared Drive folder & a private R2 bucket, so CI can
// run the save parser & importer against real game output (#466). The saves hold player data, so
// the bucket has no public domain & the files are never committed.
//
//   pnpm run saves:upload   copy each save named in SAVE_OBSERVATIONS from pipeline/input/ to R2
//                           (needs R2_UPLOAD_TOKEN & CLOUDFLARE_ACCOUNT_ID, as the other uploads)
//   pnpm run saves:fetch    copy them from R2 into pipeline/input/ (CI; needs R2_SAVES_READ_TOKEN
//                           & CLOUDFLARE_ACCOUNT_ID). Existing files are kept if their digest matches.
//
// Both commands check each file against the SHA-256 in the observation record & exit nonzero on any
// miss, so a stale or absent fixture fails loudly rather than skipping.
import "#scripts/lib/require-pinned-node";

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { SAVE_OBSERVATIONS } from "#lib/engine/import-save.observations.ts";
import { loadR2UploadEnvFile, runWrangler } from "#scripts/lib/r2-upload";

export const SAVES_BUCKET = "mistria-fyi-private";
const INPUT_DIR = path.join(import.meta.dirname, "../pipeline/input");

export interface SaveFixture {
  /** The object key in the bucket. */
  key: string;
  /** Where the file lives under `pipeline/input/`. */
  localPath: string;
  sha256: string;
}

/** The fixtures the observation records name, with their local paths & R2 keys. */
export function saveFixtures(inputDir: string = INPUT_DIR): SaveFixture[] {
  return SAVE_OBSERVATIONS.map(({ file, gameVersion, sha256 }) => ({
    key: `saves/v${gameVersion}/${file}`,
    localPath: path.join(inputDir, `v${gameVersion}`, "save", file),
    sha256,
  }));
}

async function digest(file: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

/** Runs `action` over every fixture; returns how many failed, after reporting each. */
async function forEachFixture(
  action: (fixture: SaveFixture) => Promise<string | undefined>,
): Promise<number> {
  let failures = 0;
  for (const fixture of saveFixtures()) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of files; sequential keeps output ordered
    const problem = await action(fixture);
    if (problem === undefined) {
      console.log(`ok   ${fixture.key}`);
    } else {
      failures += 1;
      console.error(`FAIL ${fixture.key}: ${problem}`);
    }
  }
  return failures;
}

export async function uploadSaves(): Promise<number> {
  if (!process.env.R2_UPLOAD_TOKEN) {
    console.error("R2_UPLOAD_TOKEN is not set; see docs/game-version-update-protocol.md.");
    return 1;
  }
  return forEachFixture(async ({ key, localPath, sha256 }) => {
    if (!existsSync(localPath)) return `missing locally at ${localPath}`;
    if ((await digest(localPath)) !== sha256) {
      return "local file does not match its recorded digest";
    }
    const { ok, output } = await runWrangler([
      "r2",
      "object",
      "put",
      `${SAVES_BUCKET}/${key}`,
      "--file",
      localPath,
      "--content-type",
      "application/octet-stream",
      "--remote",
    ]);
    return ok ? undefined : output.trim();
  });
}

export async function fetchSaves(): Promise<number> {
  const token = process.env.R2_SAVES_READ_TOKEN;
  if (!token || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    console.error("R2_SAVES_READ_TOKEN & CLOUDFLARE_ACCOUNT_ID must both be set.");
    return 1;
  }
  const { CLOUDFLARE_API_TOKEN: _inherited, ...rest } = process.env;
  const env = { ...rest, CLOUDFLARE_API_TOKEN: token };
  return forEachFixture(async ({ key, localPath, sha256 }) => {
    if (existsSync(localPath) && (await digest(localPath)) === sha256) return undefined;
    await mkdir(path.dirname(localPath), { recursive: true });
    // A stale file with the wrong digest must not make Wrangler refuse to write.
    await rm(localPath, { force: true });
    const { ok, output } = await runWrangler(
      ["r2", "object", "get", `${SAVES_BUCKET}/${key}`, "--file", localPath, "--remote"],
      env,
    );
    if (!ok) return output.trim();
    return (await digest(localPath)) === sha256
      ? undefined
      : "downloaded file does not match its recorded digest";
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const command = process.argv[2];
  if (command === "upload") {
    await loadR2UploadEnvFile();
    process.exitCode = await uploadSaves();
  } else if (command === "fetch") {
    process.exitCode = await fetchSaves();
  } else {
    console.error("Usage: node scripts/save-fixtures.ts <upload|fetch>");
    process.exitCode = 2;
  }
}
