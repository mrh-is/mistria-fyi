/**
 * Rebuilds the browser suites' sprite manifest (`tests/browser/fixtures/sprite-dimensions.json`)
 * from the staged sprites `pnpm run sprites:upload` publishes. Each tracker-data item & villager
 * gets its sprite's native `<width>x<height>`, or `null` when no sprite is staged for it (production
 * serves a 404). Reads local files only.
 *
 *   pnpm run sprites:manifest [sprites-dir]   (default: pipeline/output/sprites)
 *
 * Stage a complete sprite tree first with `pnpm run pipeline -- <path> --sprites`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

import trackerData from "../../src/lib/data/tracker-data.json" with { type: "json" };

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MANIFEST_PATH = join(REPO_ROOT, "tests/browser/fixtures/sprite-dimensions.json");
const FIXTURE_DIR = join(REPO_ROOT, "tests/browser/fixtures");
const SPRITE_KINDS = ["items", "villagers"] as const;

export type SpriteManifest = Record<string, null | string>;

/** Every sprite key the app can request: `items/<id>` & `villagers/<id>`, sorted. */
export function spriteKeys(data: {
  items: Record<string, unknown>;
  villagers: Record<string, unknown>;
}): string[] {
  return SPRITE_KINDS.flatMap((kind) =>
    Object.keys(data[kind]).map((id) => `${kind}/${id}`),
  ).toSorted();
}

export async function buildSpriteManifest(
  spritesDir: string,
  keys: readonly string[],
): Promise<SpriteManifest> {
  for (const kind of SPRITE_KINDS) {
    const dir = join(spritesDir, kind);
    // A partial tree (e.g. only `sprites:villagers`) would silently turn every sprite into a 404.
    if (!existsSync(dir) || !readdirSync(dir).some((name) => name.endsWith(".webp"))) {
      throw new Error(
        `No staged ${kind} sprites in ${dir}; run pnpm run pipeline -- <path> --sprites first.`,
      );
    }
  }

  const manifest: SpriteManifest = {};
  for (const key of keys) {
    const path = join(spritesDir, `${key}.webp`);
    if (!existsSync(path)) {
      manifest[key] = null;
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential reads keep peak memory flat across ~2,700 files
    const { height, width } = await sharp(readFileSync(path)).metadata();
    manifest[key] = `${String(width)}x${String(height)}`;
  }
  return manifest;
}

/** Sizes the browser fixture can't serve yet; each needs a synthetic `<size>.webp` committed. */
export function missingFixtureSizes(manifest: SpriteManifest, fixtureDir: string): string[] {
  const sizes = new Set(Object.values(manifest).filter((size) => size !== null));
  return [...sizes].filter((size) => !existsSync(join(fixtureDir, `${size}.webp`))).toSorted();
}

async function main(): Promise<void> {
  const spritesDir = resolve(process.argv[2] ?? join(REPO_ROOT, "pipeline/output/sprites"));
  const manifest = await buildSpriteManifest(spritesDir, spriteKeys(trackerData));
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  const missing = Object.values(manifest).filter((size) => size === null).length;
  console.log(
    `Wrote ${String(Object.keys(manifest).length)} entries (${String(missing)} without a sprite) to ${MANIFEST_PATH}`,
  );

  const newSizes = missingFixtureSizes(manifest, FIXTURE_DIR);
  if (newSizes.length > 0) {
    console.error(
      `Add a synthetic fixture for each new size (see tests/browser/fixtures/README.md): ${newSizes.join(", ")}`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
