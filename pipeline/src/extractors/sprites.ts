import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { open } from "yauzl-promise";

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
  /** Item-keyed output files newly staged (a sprite shared by several items counts once per item). */
  extracted: number;
  /** Game sprite names that were needed but not found in the source assets. */
  missing: string[];
  overridden: number;
  /** Item-keyed output files already present on disk, left untouched. */
  skipped: number;
  source: "filesystem" | "zip";
  /** Newly-converted sprites, not yet written to disk. Write with {@link publishSprites}. */
  staged: StagedSprite[];
  total: number;
}

export interface StagedSprite {
  data: Buffer;
  outPath: string;
}

/**
 * Converts newly-needed item sprites to webp in memory without touching `outputDir`, writing one
 * output file per item ID under `outputDir/items/` (a sprite shared by several items, e.g. Aldarian
 * artifact pairs, is converted once but staged once per item — duplicate objects are cheap and
 * simpler than deduping). Sprites already present in `outputDir` are counted as skipped and left
 * alone. Call {@link publishSprites} with the result's `staged` entries once every pipeline
 * validation has passed.
 */
export async function extractSprites(
  assetsDir: string,
  iconSpritesByItemId: Record<string, string>,
  outputDir: string,
): Promise<SpriteExtractionResult> {
  const itemIdsBySprite = new Map<string, string[]>();
  const overriddenItemIds: string[] = [];
  for (const [itemId, iconSprite] of Object.entries(iconSpritesByItemId)) {
    const reason = MISSING_SPRITE_OVERRIDES[iconSprite];
    if (reason) {
      overriddenItemIds.push(itemId);
    } else {
      const itemIds = itemIdsBySprite.get(iconSprite);
      if (itemIds) {
        itemIds.push(itemId);
      } else {
        itemIdsBySprite.set(iconSprite, [itemId]);
      }
    }
  }

  if (overriddenItemIds.length > 0) {
    console.log(
      `  Skipping ${overriddenItemIds.length.toString()} items with overridden sprites ` +
        `(no standard icon available)`,
    );
  }

  const itemsOutputDir = join(outputDir, "items");
  const zipPath = resolveZipPath(assetsDir);
  const result = zipPath
    ? await extractSpritesFromZip(zipPath, itemIdsBySprite, itemsOutputDir)
    : await extractSpritesFromFilesystem(assetsDir, itemIdsBySprite, itemsOutputDir);
  result.overridden = overriddenItemIds.length;
  return result;
}

/** Writes staged sprite conversions to disk. Call only after every pipeline validation passes. */
export function publishSprites(staged: readonly StagedSprite[]): void {
  for (const { data, outPath } of staged) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, data);
  }
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
  itemIdsBySprite: Map<string, string[]>,
  itemsOutputDir: string,
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

  const total = totalItemCount(itemIdsBySprite);
  console.log(
    `  Sprites: ${itemIdsBySprite.size.toString()} unique sprites for ${total.toString()} items, ` +
      `${spriteIndex.size.toString()} available`,
  );

  let extracted = 0;
  let skipped = 0;
  const missing: string[] = [];
  const staged: StagedSprite[] = [];

  for (const spriteName of [...itemIdsBySprite.keys()].sort()) {
    const itemIds = itemIdsBySprite.get(spriteName) ?? [];
    const sourcePath = spriteIndex.get(spriteName);
    if (!sourcePath) {
      missing.push(spriteName);
      continue;
    }

    const counts = await stageItemsForSprite(
      itemIds,
      itemsOutputDir,
      () => convertToWebp(readFileSync(sourcePath)),
      staged,
    );
    extracted += counts.extracted;
    skipped += counts.skipped;
  }

  return {
    extracted,
    missing,
    overridden: 0,
    skipped,
    source: "filesystem",
    staged,
    total,
  };
}

async function extractSpritesFromZip(
  zipPath: string,
  itemIdsBySprite: Map<string, string[]>,
  itemsOutputDir: string,
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
      if (itemIdsBySprite.has(spriteName) && !spriteData.has(spriteName)) {
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

  const total = totalItemCount(itemIdsBySprite);
  console.log(
    `  Sprites: ${itemIdsBySprite.size.toString()} unique sprites for ${total.toString()} items, ` +
      `${spriteData.size.toString()} found in zip`,
  );

  let extracted = 0;
  let skipped = 0;
  const missing: string[] = [];
  const staged: StagedSprite[] = [];

  for (const spriteName of [...itemIdsBySprite.keys()].sort()) {
    const itemIds = itemIdsBySprite.get(spriteName) ?? [];
    const pngData = spriteData.get(spriteName);
    if (!pngData) {
      missing.push(spriteName);
      continue;
    }

    const counts = await stageItemsForSprite(
      itemIds,
      itemsOutputDir,
      () => convertToWebp(pngData),
      staged,
    );
    extracted += counts.extracted;
    skipped += counts.skipped;
  }

  return {
    extracted,
    missing,
    overridden: 0,
    skipped,
    source: "zip",
    staged,
    total,
  };
}

function resolveZipPath(assetsDir: string): string | undefined {
  const candidates = [resolve(assetsDir, "assets.zip"), resolve(assetsDir, "..", "assets.zip")];
  return candidates.find((p) => existsSync(p));
}

/** Stages one output file per item ID sharing `spriteName`, converting the source data once. */
async function stageItemsForSprite(
  itemIds: readonly string[],
  itemsOutputDir: string,
  loadWebp: () => Promise<Buffer>,
  staged: StagedSprite[],
): Promise<{ extracted: number; skipped: number }> {
  let extracted = 0;
  let skipped = 0;
  let webpData: Buffer | undefined;

  for (const itemId of [...itemIds].sort()) {
    const outPath = join(itemsOutputDir, `${itemId}.webp`);
    if (existsSync(outPath)) {
      skipped++;
      continue;
    }
    webpData ??= await loadWebp();
    staged.push({ data: webpData, outPath });
    extracted++;
  }

  return { extracted, skipped };
}

function totalItemCount(itemIdsBySprite: Map<string, string[]>): number {
  let total = 0;
  for (const itemIds of itemIdsBySprite.values()) total += itemIds.length;
  return total;
}
