/**
 * The pipeline parses, evaluates in place, assembles (see {@link assembleTrackerData}), and
 * serializes output. Writes begin only after every transformation succeeds.
 * --parse-only checks parser structure without requiring a particular game version.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LOCALE_CODES } from "#lib/types/locale.js";

import { assembleTrackerData } from "./assemble.js";
import { parseCliOptions, resolveCallerPath } from "./cli-options.js";
import { publishFiles } from "./emit/publish.js";
import { extractSprites, extractVillagerSprites, publishSprites } from "./emit/sprites.js";
import { extractVillagerIconSprites } from "./extract/villagers.js";
import { assertGameLanguageMapExhaustive } from "./localize/locale-codes.js";
import { createAssetsLocalizer, generateLocaleManifest } from "./localize/localize.js";
import { validateReviewedGameFacts } from "./overrides/validate.js";
import {
  DEFAULT_WINDOWS_STEAM_ASSETS_DIR,
  readInstalledGameVersion,
  resolveAssetsZipPath,
  resolveSpriteArchivePath,
} from "./parse/assets-zip.js";
import { evaluateExpressions } from "./parse/evaluate.js";
import { parseFiddle, parseFiddleFromZip } from "./parse/parse-fiddle.js";
import { checkParseSmoke } from "./parse/parse-smoke.js";

import type { LocaleChunk } from "./assemble.js";
import type { StagedFile } from "./emit/publish.js";
import type { SpriteExtractionResult, StagedSprite } from "./emit/sprites.js";
import type { ParsedGameData } from "./parse/parse-fiddle.js";

const __dirname = import.meta.dirname;
const PIPELINE_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(PIPELINE_ROOT, "output");
const APP_DATA_DIR = resolve(PIPELINE_ROOT, "..", "src", "lib", "data");
const OUTPUT_FILE = "tracker-data.json";
const SPRITES_OUTPUT_ROOT = resolve(OUTPUT_DIR, "sprites");

/** Reads the game version of the committed tracker data, as a hint when the assets lack one. */
function readCommittedVersion(): string | undefined {
  try {
    const data = JSON.parse(readFileSync(resolve(APP_DATA_DIR, OUTPUT_FILE), "utf8")) as {
      version?: unknown;
    };
    return typeof data.version === "string" ? data.version : undefined;
  } catch {
    return undefined;
  }
}

/** Logs sprite extraction results for a given entity kind. */
function logSpriteExtraction(label: string, result: SpriteExtractionResult): void {
  console.log(
    `  ${label}: extracted ${result.extracted} new, ${result.skipped} unchanged, ${result.total} total`,
  );
}

async function main(): Promise<void> {
  console.log("📚 Mistria Field Guide — Data Pipeline\n");

  let options;
  try {
    options = parseCliOptions(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }
  const callerAssetsDir = options.assetsDir ?? process.env.MISTRIA_ASSETS;
  const assetsDir =
    (callerAssetsDir === undefined ? undefined : resolveCallerPath(callerAssetsDir)) ??
    (existsSync(DEFAULT_WINDOWS_STEAM_ASSETS_DIR) ? DEFAULT_WINDOWS_STEAM_ASSETS_DIR : undefined);
  if (!assetsDir) {
    console.error("Usage: tsx src/main.ts <path-to-assets-dir> [--version=X.Y.Z|current]");
    console.error("  Or set MISTRIA_ASSETS environment variable");
    console.error(`  Or install the game at its default Steam location on Windows:`);
    console.error(`    ${DEFAULT_WINDOWS_STEAM_ASSETS_DIR}`);
    process.exitCode = 1;
    return;
  }

  // Prefer an already-extracted fiddle/ on disk; otherwise read straight out of assets.zip
  // (Steam's own distribution format) without ever extracting it. Either shape produces the same
  // ParsedGameData, so every downstream extractor is source-agnostic.
  const fiddleDir = resolve(assetsDir, "fiddle");
  let fiddleSource: { kind: "disk" } | { kind: "zip"; zipPath: string };
  if (existsSync(fiddleDir)) {
    fiddleSource = { kind: "disk" };
  } else {
    const zipPath = resolveAssetsZipPath(assetsDir);
    if (!zipPath) {
      console.error(
        `❌ Missing input: no fiddle/ directory and no assets.zip found under ${assetsDir}`,
      );
      console.error(
        "   Pass the path to the assets directory containing fiddle/, or to a directory",
      );
      console.error("   containing assets.zip (e.g. the Steam install directory).");
      process.exitCode = 1;
      return;
    }
    fiddleSource = { kind: "zip", zipPath };
  }

  if (fiddleSource.kind === "zip" && !options.parseOnly && !options.villagerSpritesOnly) {
    console.error("❌ Full pipeline extraction requires an on-disk fiddle/ directory.");
    console.error(
      "   Extract your game assets first, or use --parse-only or --villager-sprites-only with assets.zip.",
    );
    process.exitCode = 1;
    return;
  }

  if (!options.parseOnly && !options.villagerSpritesOnly) {
    assertGameLanguageMapExhaustive(assetsDir);
  }

  console.log("Step 1: Parsing TOML data...");
  const parsed =
    fiddleSource.kind === "disk"
      ? parseFiddle(assetsDir)
      : await parseFiddleFromZip(
          fiddleSource.zipPath,
          options.villagerSpritesOnly ? ["npcs"] : undefined,
        );
  const fiddle = parsed.data;

  if (options.parseOnly) {
    try {
      checkParseSmoke(parsed, options.parseProfile);
    } catch (error) {
      console.error(`  ❌ ${(error as Error).message}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `  ✅ Parse-only ${options.parseProfile ? `${options.parseProfile} fixture profile` : "structural smoke test"} passed`,
    );
    return;
  }

  if (options.villagerSpritesOnly) {
    await runVillagerSpritesOnly(fiddle, assetsDir);
    return;
  }

  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const version =
    options.version ??
    (misc?.version as string | undefined) ??
    readInstalledGameVersion(resolveAssetsZipPath(assetsDir));
  if (!version) {
    console.error(
      "❌ No game version found. Pass --version=X.Y.Z (or --version=current) or ensure misc.version exists.",
    );
    const committedVersion = readCommittedVersion();
    if (committedVersion) {
      console.error(`  The committed ${OUTPUT_FILE} was generated from ${committedVersion}.`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`  Game version: ${version}\n`);

  console.log("Step 2: Evaluating expressions...");
  evaluateExpressions(fiddle);
  validateReviewedGameFacts(fiddle);
  console.log();

  const { iconSpritesByItemId, iconSpritesByVillagerId, localeChunks, trackerData } =
    assembleTrackerData(fiddle, createAssetsLocalizer(assetsDir), {
      version,
    });

  const json = JSON.stringify(trackerData);
  const prettyJson = JSON.stringify(trackerData, null, 2);

  console.log("Step 5: Staging outputs...");
  const staged: StagedFile[] = [{ content: prettyJson, path: resolve(OUTPUT_DIR, OUTPUT_FILE) }];
  console.log(
    `  Staged: pipeline/output/${OUTPUT_FILE} (${(prettyJson.length / 1024).toFixed(1)} KB pretty)`,
  );

  staged.push({ content: json, path: resolve(APP_DATA_DIR, OUTPUT_FILE) });
  console.log(
    `  Staged: src/lib/data/${OUTPUT_FILE} (${(json.length / 1024).toFixed(1)} KB minified)`,
  );

  const localeManifest = generateLocaleManifest(assetsDir);
  const localeManifestJson = `${JSON.stringify(localeManifest, null, 2)}\n`;
  staged.push({ content: localeManifestJson, path: resolve(APP_DATA_DIR, "locales.json") });
  console.log(`  Staged: src/lib/data/locales.json (${localeManifest.length} locales)`);

  for (const chunk of localeChunks) {
    stageLocaleChunks(staged, chunk);
  }

  const fiddlePretty = JSON.stringify(fiddle, null, 2);
  staged.push({ content: fiddlePretty, path: resolve(OUTPUT_DIR, "fiddle-readable.json") });
  console.log(
    `  Staged: pipeline/output/fiddle-readable.json (${(fiddlePretty.length / 1024 / 1024).toFixed(1)} MB)`,
  );

  let stagedSprites: StagedSprite[] = [];
  const extractSpritesFlag = options.sprites;
  const zipPath = resolveSpriteArchivePath(resolve(assetsDir), version);
  if (extractSpritesFlag) {
    console.log("\nStep 6: Extracting item and villager sprites...");
    const itemSpriteResult = await extractSprites(
      resolve(assetsDir),
      iconSpritesByItemId,
      SPRITES_OUTPUT_ROOT,
      zipPath,
    );
    const villagerSpriteResult = await extractVillagerSprites(
      resolve(assetsDir),
      iconSpritesByVillagerId,
      SPRITES_OUTPUT_ROOT,
      zipPath,
    );
    logSpriteExtraction("Items", itemSpriteResult);
    logSpriteExtraction("Villagers", villagerSpriteResult);
    const missing = [...itemSpriteResult.missing, ...villagerSpriteResult.missing];
    if (reportMissingSprites(missing)) return;
    stagedSprites = [...itemSpriteResult.staged, ...villagerSpriteResult.staged];
  }

  console.log(`\nStep ${extractSpritesFlag ? "7" : "6"}: Publishing outputs...`);
  publishFiles(staged);
  publishSprites(stagedSprites);
  console.log(
    `  Published ${staged.length} files${
      stagedSprites.length > 0 ? ` and ${stagedSprites.length} sprites` : ""
    }`,
  );

  console.log("\n✅ Pipeline complete!");
}

/**
 * Reports missing sprites and flags the process as failed. Returns true when the caller must abort
 * the pipeline.
 */
function reportMissingSprites(missing: readonly string[]): boolean {
  if (missing.length === 0) return false;
  console.error(`  ❌ ${missing.length} sprites not found:`);
  for (const name of missing) {
    console.error(`    - ${name}`);
  }
  console.error("  Aborting before publish: no tracked output file was written.");
  process.exitCode = 1;
  return true;
}

/**
 * A lightweight pipeline mode for regenerating only villager sprites: `fiddle.npcs` plus
 * `assets.zip`'s NPC icon PNGs are enough, so this never touches `tracker-data.json`, locale
 * chunks, or any other output, and never requires an on-disk `fiddle/` extraction — it works
 * directly off `assets.zip` (see {@link parseFiddleFromZip}), including at the default Steam
 * install location with zero configuration. Invoke with `pnpm run pipeline -- --villager-sprites-only` or
 * `pnpm run sprites:villagers`.
 */
async function runVillagerSpritesOnly(fiddle: ParsedGameData, assetsDir: string): Promise<void> {
  console.log("Step 2: Extracting villager sprites...");
  const iconSpritesByVillagerId = extractVillagerIconSprites(fiddle);
  const result = await extractVillagerSprites(
    resolve(assetsDir),
    iconSpritesByVillagerId,
    SPRITES_OUTPUT_ROOT,
  );
  logSpriteExtraction("Villagers", result);
  if (reportMissingSprites(result.missing)) return;

  publishSprites(result.staged);
  console.log(`  Published ${result.staged.length} villager sprites`);
  console.log("\n✅ Villager sprites regenerated. Run `pnpm run sprites:upload` to publish them.");
}

/**
 * Stages one `src/lib/data/locales/<bcp47-tag>/<category>.json` chunk per locale. Chunks are
 * emitted for every locale including `en`, which is both a locale in its own right and the
 * fallback every other locale resolves through. Nothing is written until {@link publishFiles}.
 */
function stageLocaleChunks(staged: StagedFile[], { byLocale, category }: LocaleChunk) {
  let totalBytes = 0;
  for (const locale of LOCALE_CODES) {
    const directory = resolve(APP_DATA_DIR, "locales", locale);
    const chunkPath = resolve(directory, `${category}.json`);
    const chunkJson = `${JSON.stringify(byLocale[locale], null, 2)}\n`;
    staged.push({ content: chunkJson, path: chunkPath });
    totalBytes += chunkJson.length;
  }
  console.log(
    `  Staged: src/lib/data/locales/*/${category}.json ` +
      `(${LOCALE_CODES.length.toString()} locales, ${(totalBytes / 1024).toFixed(1)} KB total)`,
  );
}

await main();
