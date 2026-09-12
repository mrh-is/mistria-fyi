import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { open } from "yauzl-promise";

import type { TrackerData } from "$lib/types/tracker-data.js";

const SPRITE_SEARCH_DIRS = [
  join("animations", "Item Icons"),
  join("animations", "Placeables"),
  join("animations", "Player"),
];

const SPRITE_ZIP_PREFIXES = SPRITE_SEARCH_DIRS.map((d) => `assets/${d.replaceAll("\\", "/")}/`);

// Sprites that are known to be unavailable as standard item icons.
// Each entry must have an explicit reason — the pipeline errors on any unlisted missing sprite.
const MISSING_SPRITE_OVERRIDES: Record<string, string> = {
  spr_illegal_16: "internal placeholder sprite for blacklisted/invalid items",
  spr_mob_coin: "mob currency drop, not a standard item icon",
  spr_mob_coin_large_spring: "mob currency drop, not a standard item icon",
  spr_mob_coin_medium_spring: "mob currency drop, not a standard item icon",
  spr_mob_coin_tree_main: "mob currency drop, not a standard item icon",
  spr_prop_lumber_plank_horizontal_medium_spring: "quest prop sprite (Ryis' Lumber)",
  spr_town_crate_cutscene_spring: "quest prop sprite (Balor's Crate)",
};

export interface SpriteExtractionResult {
  extracted: number;
  missing: string[];
  overridden: number;
  skipped: number;
  source: "filesystem" | "zip";
  total: number;
}

export async function extractSprites(
  assetsDir: string,
  items: TrackerData["items"],
  outputDir: string,
): Promise<SpriteExtractionResult> {
  const neededSprites = new Set<string>();
  const overriddenSprites: string[] = [];
  for (const item of Object.values(items)) {
    const reason = MISSING_SPRITE_OVERRIDES[item.iconSprite];
    if (reason) {
      overriddenSprites.push(item.iconSprite);
    } else {
      neededSprites.add(item.iconSprite);
    }
  }

  if (overriddenSprites.length > 0) {
    const unique = [...new Set(overriddenSprites)].sort();
    console.log(`  Skipping ${unique.length} overridden sprites (no standard icon available)`);
  }

  const zipPath = resolveZipPath(assetsDir);
  const result = zipPath
    ? await extractSpritesFromZip(zipPath, neededSprites, outputDir)
    : await extractSpritesFromFilesystem(assetsDir, neededSprites, outputDir);
  result.overridden = new Set(overriddenSprites).size;
  return result;
}

function buildSpriteIndex(rootDir: string, index: Map<string, string>): void {
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name));
      } else if (
        entry.name.startsWith("spr_ui_item_") &&
        entry.name.endsWith(".png") &&
        !entry.name.endsWith("_outline.png")
      ) {
        const spriteName = entry.name.slice(0, -4);
        if (!index.has(spriteName)) {
          index.set(spriteName, join(dir, entry.name));
        }
      }
    }
  }

  walk(rootDir);
}

async function convertToWebp(pngData: Buffer): Promise<Buffer> {
  return sharp(pngData).webp({ effort: 6, lossless: true }).toBuffer();
}

async function extractSpritesFromFilesystem(
  assetsDir: string,
  neededSprites: Set<string>,
  outputDir: string,
): Promise<SpriteExtractionResult> {
  const spriteIndex = new Map<string, string>();
  for (const subdir of SPRITE_SEARCH_DIRS) {
    const dir = resolve(assetsDir, subdir);
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      buildSpriteIndex(dir, spriteIndex);
    }
  }

  if (spriteIndex.size === 0) {
    throw new Error(
      `No sprite PNGs found in any search directory.\n` +
        `The full assets directory must be extracted (not just fiddle/).`,
    );
  }

  console.log(`  Sprites: ${neededSprites.size} needed, ${spriteIndex.size} available`);

  mkdirSync(outputDir, { recursive: true });

  let extracted = 0;
  let skipped = 0;
  const missing: string[] = [];

  for (const spriteName of [...neededSprites].sort()) {
    const sourcePath = spriteIndex.get(spriteName);
    if (!sourcePath) {
      missing.push(spriteName);
      continue;
    }

    const outPath = join(outputDir, `${spriteName}.webp`);
    if (existsSync(outPath)) {
      skipped++;
      continue;
    }

    const sourceData = readFileSync(sourcePath);
    const webpData = await convertToWebp(sourceData);
    writeFileSync(outPath, webpData);
    extracted++;
  }

  return {
    extracted,
    missing,
    overridden: 0,
    skipped,
    source: "filesystem",
    total: neededSprites.size,
  };
}

async function extractSpritesFromZip(
  zipPath: string,
  neededSprites: Set<string>,
  outputDir: string,
): Promise<SpriteExtractionResult> {
  console.log(`  Reading sprites from ${zipPath}`);

  const zipFile = await open(zipPath);

  const spriteData = new Map<string, Buffer>();
  try {
    for await (const entry of zipFile) {
      if (entry.filename.endsWith("/")) continue;
      if (!entry.filename.endsWith(".png")) continue;
      if (entry.filename.endsWith("_outline.png")) continue;

      const inSearchDir = SPRITE_ZIP_PREFIXES.some((prefix) => entry.filename.startsWith(prefix));
      if (!inSearchDir) continue;

      const basename = entry.filename.split("/").at(-1) ?? "";
      if (!basename.startsWith("spr_ui_item_")) continue;

      const spriteName = basename.slice(0, -4);
      if (neededSprites.has(spriteName) && !spriteData.has(spriteName)) {
        const stream = await entry.openReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk as Buffer);
        }
        spriteData.set(spriteName, Buffer.concat(chunks));
      }
    }
  } finally {
    await zipFile.close();
  }

  console.log(`  Sprites: ${neededSprites.size} needed, ${spriteData.size} found in zip`);

  mkdirSync(outputDir, { recursive: true });

  let extracted = 0;
  let skipped = 0;
  const missing: string[] = [];

  for (const spriteName of [...neededSprites].sort()) {
    const pngData = spriteData.get(spriteName);
    if (!pngData) {
      missing.push(spriteName);
      continue;
    }

    const outPath = join(outputDir, `${spriteName}.webp`);
    if (existsSync(outPath)) {
      skipped++;
      continue;
    }

    const webpData = await convertToWebp(pngData);
    writeFileSync(outPath, webpData);
    extracted++;
  }

  return { extracted, missing, overridden: 0, skipped, source: "zip", total: neededSprites.size };
}

function resolveZipPath(assetsDir: string): string | undefined {
  const candidates = [resolve(assetsDir, "assets.zip"), resolve(assetsDir, "..", "assets.zip")];
  return candidates.find((p) => existsSync(p));
}
