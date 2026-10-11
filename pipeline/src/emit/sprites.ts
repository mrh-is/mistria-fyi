import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { open } from "yauzl-promise";

import { compareStrings } from "../ordering.js";
import { resolveAssetsZipPath } from "../parse/assets-zip.js";

const ITEM_SPRITE_SEARCH_DIRS = [
  join("animations", "Item Icons"),
  join("animations", "Placeables"),
  join("animations", "Player"),
];

const VILLAGER_SPRITE_SEARCH_DIRS = [join("animations", "UI NEW", "Generic", "Icons", "NPC")];

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

/** Recognizes the game's on-disk sprite filenames for one entity kind and how to file its output. */
interface SpriteKind {
  /** Returns the sprite name (filename minus `.png`) if `basename` is a sprite this kind owns. */
  matchesFilename: (basename: string) => boolean;
  /** Subdirectory of the sprites output root this kind's converted files are staged under. */
  outputSubdir: string;
  searchDirs: string[];
}

const ITEM_SPRITE_KIND: SpriteKind = {
  matchesFilename: (basename) =>
    basename.startsWith("spr_ui_item_") && !basename.endsWith("_outline.png"),
  outputSubdir: "items",
  searchDirs: ITEM_SPRITE_SEARCH_DIRS,
};

const VILLAGER_SPRITE_KIND: SpriteKind = {
  matchesFilename: (basename) => !basename.endsWith("_outline.png"),
  outputSubdir: "villagers",
  searchDirs: VILLAGER_SPRITE_SEARCH_DIRS,
};

export interface SpriteExtractionResult {
  /** Entity-keyed output files newly staged (a sprite shared by several entities counts once each). */
  extracted: number;
  /** Game sprite names that were needed but not found in the source assets. */
  missing: string[];
  overridden: number;
  /** Entity-keyed output files already present on disk, left untouched. */
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
  zipPath?: string,
): Promise<SpriteExtractionResult> {
  return extractSpritesForKind(
    ITEM_SPRITE_KIND,
    assetsDir,
    iconSpritesByItemId,
    outputDir,
    true,
    zipPath,
  );
}

/**
 * Converts newly-needed villager sprites to webp in memory without touching `outputDir`, writing
 * one output file per villager ID under `outputDir/villagers/`. Behaves like {@link extractSprites}
 * otherwise, including deferring writes to {@link publishSprites}.
 */
export async function extractVillagerSprites(
  assetsDir: string,
  iconSpritesByVillagerId: Record<string, string>,
  outputDir: string,
  zipPath?: string,
): Promise<SpriteExtractionResult> {
  return extractSpritesForKind(
    VILLAGER_SPRITE_KIND,
    assetsDir,
    iconSpritesByVillagerId,
    outputDir,
    false,
    zipPath,
  );
}

/** Writes staged sprite conversions to disk. Call only after every pipeline validation passes. */
export function publishSprites(staged: readonly StagedSprite[]): void {
  for (const { data, outPath } of staged) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, data);
  }
}

function buildSpriteIndex(kind: SpriteKind, rootDir: string, index: Map<string, string>): void {
  const candidates: { path: string; spriteName: string }[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true }).toSorted((a, b) =>
      compareStrings(a.name, b.name),
    )) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name));
      } else if (entry.name.endsWith(".png") && kind.matchesFilename(entry.name)) {
        candidates.push({ path: join(dir, entry.name), spriteName: entry.name.slice(0, -4) });
      }
    }
  }

  walk(rootDir);
  for (const { path, spriteName } of candidates.toSorted((a, b) =>
    compareStrings(a.path, b.path),
  )) {
    if (!index.has(spriteName)) index.set(spriteName, path);
  }
}

async function convertToWebp(pngData: Buffer): Promise<Buffer> {
  return sharp(pngData).webp({ effort: 6, lossless: true }).toBuffer();
}

async function extractSpritesForKind(
  kind: SpriteKind,
  assetsDir: string,
  iconSpritesByEntityId: Record<string, string>,
  outputDir: string,
  applyOverrides: boolean,
  zipPathOverride?: string,
): Promise<SpriteExtractionResult> {
  const entityIdsBySprite = new Map<string, string[]>();
  const overriddenEntityIds: string[] = [];
  for (const [entityId, iconSprite] of Object.entries(iconSpritesByEntityId)) {
    const reason = applyOverrides ? MISSING_SPRITE_OVERRIDES[iconSprite] : undefined;
    if (reason) {
      overriddenEntityIds.push(entityId);
    } else {
      const entityIds = entityIdsBySprite.get(iconSprite);
      if (entityIds) {
        entityIds.push(entityId);
      } else {
        entityIdsBySprite.set(iconSprite, [entityId]);
      }
    }
  }

  if (overriddenEntityIds.length > 0) {
    console.log(
      `  Skipping ${overriddenEntityIds.length.toString()} entities with overridden sprites ` +
        `(no standard icon available)`,
    );
  }

  const kindOutputDir = join(outputDir, kind.outputSubdir);
  const zipPath = zipPathOverride ?? resolveAssetsZipPath(assetsDir);
  const result = zipPath
    ? await extractSpritesFromZip(kind, zipPath, entityIdsBySprite, kindOutputDir)
    : await extractSpritesFromFilesystem(kind, assetsDir, entityIdsBySprite, kindOutputDir);
  result.overridden = overriddenEntityIds.length;
  return result;
}

async function extractSpritesFromFilesystem(
  kind: SpriteKind,
  assetsDir: string,
  entityIdsBySprite: Map<string, string[]>,
  entityOutputDir: string,
): Promise<SpriteExtractionResult> {
  const spriteIndex = new Map<string, string>();
  for (const subdir of kind.searchDirs) {
    const dir = resolve(assetsDir, subdir);
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      buildSpriteIndex(kind, dir, spriteIndex);
    }
  }

  if (spriteIndex.size === 0) {
    throw new Error(
      `No sprite PNGs found in any search directory.\n` +
        `The full assets directory must be extracted (not just fiddle/).`,
    );
  }

  const total = totalEntityCount(entityIdsBySprite);
  console.log(
    `  Sprites: ${entityIdsBySprite.size.toString()} unique sprites for ${total.toString()} entities, ` +
      `${spriteIndex.size.toString()} available`,
  );

  let extracted = 0;
  let skipped = 0;
  const missing: string[] = [];
  const staged: StagedSprite[] = [];

  for (const spriteName of [...entityIdsBySprite.keys()].toSorted(compareStrings)) {
    const entityIds = entityIdsBySprite.get(spriteName) ?? [];
    const sourcePath = spriteIndex.get(spriteName);
    if (!sourcePath) {
      missing.push(spriteName);
      continue;
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- sprites stage sequentially so the staged output order and peak memory stay deterministic
    const counts = await stageEntitiesForSprite(
      entityIds,
      entityOutputDir,
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
  kind: SpriteKind,
  zipPath: string,
  entityIdsBySprite: Map<string, string[]>,
  entityOutputDir: string,
): Promise<SpriteExtractionResult> {
  const zipPrefixes = kind.searchDirs.map((d) => `assets/${d.replaceAll("\\", "/")}/`);
  // Each kind opens its own handle: a fully iterated yauzl-promise ZipFile yields no entries again.
  const zipFile = await open(zipPath);
  console.log(`  Reading ${kind.outputSubdir} sprites from ${zipPath}`);

  const spriteData = new Map<string, Buffer>();
  const selectedPaths = new Map<string, { path: string; priority: number }>();
  try {
    for await (const entry of zipFile) {
      if (entry.filename.endsWith("/")) continue;
      if (!entry.filename.endsWith(".png")) continue;

      const priority = zipPrefixes.findIndex((prefix) => entry.filename.startsWith(prefix));
      if (priority === -1) continue;

      const basename = entry.filename.split("/").at(-1) ?? "";
      if (!kind.matchesFilename(basename)) continue;

      const spriteName = basename.slice(0, -4);
      const selected = selectedPaths.get(spriteName);
      // Match disk lookup: search-directory priority, then sorted relative filename.
      const preferred =
        !selected ||
        priority < selected.priority ||
        (priority === selected.priority && compareStrings(entry.filename, selected.path) < 0);
      if (entityIdsBySprite.has(spriteName) && preferred) {
        selectedPaths.set(spriteName, { path: entry.filename, priority });
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

  if (spriteData.size === 0) {
    throw new Error(
      `No sprite PNGs found in any search directory.\n` +
        `The full assets directory must be extracted (not just fiddle/).`,
    );
  }

  const total = totalEntityCount(entityIdsBySprite);

  console.log(
    `  Sprites: ${entityIdsBySprite.size.toString()} unique sprites for ${total.toString()} entities, ` +
      `${spriteData.size.toString()} found in zip`,
  );

  let extracted = 0;
  let skipped = 0;
  const missing: string[] = [];
  const staged: StagedSprite[] = [];

  for (const spriteName of [...entityIdsBySprite.keys()].toSorted(compareStrings)) {
    const entityIds = entityIdsBySprite.get(spriteName) ?? [];
    const pngData = spriteData.get(spriteName);
    if (!pngData) {
      missing.push(spriteName);
      continue;
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- sprites stage sequentially so the staged output order and peak memory stay deterministic
    const counts = await stageEntitiesForSprite(
      entityIds,
      entityOutputDir,
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

/** Stages one output file per entity ID sharing `spriteName`, converting the source data once. */
async function stageEntitiesForSprite(
  entityIds: readonly string[],
  entityOutputDir: string,
  loadWebp: () => Promise<Buffer>,
  staged: StagedSprite[],
): Promise<{ extracted: number; skipped: number }> {
  let extracted = 0;
  let skipped = 0;
  let webpData: Buffer | undefined;

  for (const entityId of [...entityIds].toSorted(compareStrings)) {
    const outPath = join(entityOutputDir, `${entityId}.webp`);
    // Compare the converted bytes so a game update refreshes existing sprites too.
    // oxlint-disable-next-line eslint/no-await-in-loop -- convert each shared sprite once before comparing existing outputs
    webpData ??= await loadWebp();
    if (existsSync(outPath) && readFileSync(outPath).equals(webpData)) {
      skipped++;
      continue;
    }
    staged.push({ data: webpData, outPath });
    extracted++;
  }

  return { extracted, skipped };
}

function totalEntityCount(entityIdsBySprite: Map<string, string[]>): number {
  let total = 0;
  for (const entityIds of entityIdsBySprite.values()) total += entityIds.length;
  return total;
}
