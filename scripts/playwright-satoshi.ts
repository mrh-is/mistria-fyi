/**
 * Places the production Satoshi font where the browser suites serve it, so geometry measures
 * production metrics (#708). CI runs this before the accessibility suite; the font never enters
 * the repository (see docs/font-assets.md). An existing copy is verified, not refetched.
 *
 *   pnpm exec tsx scripts/playwright-satoshi.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PRODUCTION_ASSET_ORIGIN } from "../src/lib/asset-origin.js";

export const SATOSHI_URL = `${PRODUCTION_ASSET_ORIGIN}/fonts/satoshi-regular.woff2`;
/** Gitignored; CI caches it under a key derived from this file, so the hash below pins it. */
export const SATOSHI_PATH = fileURLToPath(
  new URL("../tests/browser/fixtures/local/satoshi-regular.woff2", import.meta.url),
);
export const SATOSHI_SHA256 = "5aa97d938f523dd893c52473c3a021a0bf4ba0f95290edcc0749c088717f951f";

export function verifySatoshi(font: Uint8Array, source: string): void {
  const actual = createHash("sha256").update(font).digest("hex");
  if (actual !== SATOSHI_SHA256) {
    throw new Error(
      `Satoshi from ${source} has SHA-256 ${actual}, expected ${SATOSHI_SHA256}. If the hosted ` +
        `font changed deliberately, update SATOSHI_SHA256 in scripts/playwright-satoshi.ts.`,
    );
  }
}

export async function ensureSatoshi(
  path = SATOSHI_PATH,
  fetchFont: (url: string) => Promise<Response> = fetch,
): Promise<"cached" | "downloaded"> {
  if (existsSync(path)) {
    verifySatoshi(readFileSync(path), path);
    return "cached";
  }
  const response = await fetchFont(SATOSHI_URL);
  if (!response.ok) {
    throw new Error(`Downloading Satoshi from ${SATOSHI_URL} failed with HTTP ${response.status}`);
  }
  const font = new Uint8Array(await response.arrayBuffer());
  verifySatoshi(font, SATOSHI_URL);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, font);
  return "downloaded";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`Satoshi ${await ensureSatoshi()}: ${SATOSHI_PATH}`);
}
