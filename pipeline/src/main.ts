/**
 * The pipeline parses, evaluates in place, extracts, assembles, and serializes output. Writes begin only after every transformation succeeds.
 * --parse-only is a v1.0.5-specific smoke test that exits before evaluation.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { open } from "yauzl-promise";

import { LOCALE_CODES } from "#lib/types/locale.js";
import { isNonEmptyArray, recordEntries } from "#lib/utils/record.js";

import { collectExplorationSources } from "./acquisition/collectors/exploration.js";
import { collectNaturalSources } from "./acquisition/collectors/natural.js";
import { collectRewardSources } from "./acquisition/collectors/rewards.js";
import { collectStoreSources } from "./acquisition/collectors/stores.js";
import { getExcludedCosmeticIds } from "./acquisition/exclusions.js";
import { collectNativeReferenceRegistries } from "./acquisition/native-references.js";
import { deriveRecipeProductSources } from "./acquisition/recipe-products.js";
import { AcquisitionReferenceIndex } from "./acquisition/reference-index.js";
import {
  applyReviewedOverrides,
  collectDefaultCosmeticSources,
  collectDefaultItemSources,
} from "./acquisition/reviewed-overrides.js";
import { REVIEWED_NON_NATIVE_REFERENCES } from "./acquisition/reviewed-references.js";
import {
  AnimalCosmeticSourceAccumulator,
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
  PetCosmeticSourceAccumulator,
} from "./acquisition/source-accumulator.js";
import { validateAcquisitionSources } from "./acquisition/validate-sources.js";
import {
  DEFAULT_WINDOWS_STEAM_ASSETS_DIR,
  readInstalledGameVersion,
  resolveAssetsZipPath,
} from "./assets-zip.js";
import { PipelineDiagnostics } from "./diagnostics.js";
import { evaluateExpressions } from "./evaluate.js";
import { forEachItem } from "./extractor-helpers.js";
import { extractAlmanac, readAlmanacCategories } from "./extractors/almanac.js";
import { extractAnimals } from "./extractors/animals.js";
import { extractCosmetics } from "./extractors/cosmetics.js";
import { extractDates } from "./extractors/dates.js";
import { extractFestivals } from "./extractors/festivals.js";
import { extractMines } from "./extractors/mines.js";
import { extractMuseum } from "./extractors/museum.js";
import { extractPetCosmetics, extractPetSkins } from "./extractors/pets.js";
import { extractQuests } from "./extractors/quests.js";
import { deriveRecipeLocaleNames, extractRecipes } from "./extractors/recipes.js";
import { extractTownRanks } from "./extractors/renown.js";
import { extractSkills } from "./extractors/skills.js";
import { extractSprites, extractVillagerSprites, publishSprites } from "./extractors/sprites.js";
import { extractStoresMeta } from "./extractors/stores-meta.js";
import { extractTreasureChestTiers } from "./extractors/treasure-chest-tiers.js";
import { APP_UI_STRINGS, extractUiStrings, tierKeys } from "./extractors/ui-strings.js";
import { extractVillagerIconSprites, extractVillagers } from "./extractors/villagers.js";
import { buildCutsceneQuestMap } from "./extractors/visibility/cutscene-quest-map.js";
import {
  assignEntityVisibility,
  extractCategoryVisibility,
  extractHeartLevelChanges,
  stampStoreVisibility,
  stampVillagerVisibility,
} from "./extractors/visibility/entity-visibility.js";
import { extractQuestChains } from "./extractors/visibility/quest-chains.js";
import { assertGameLanguageMapExhaustive } from "./locale-codes.js";
import { generateLocaleManifest } from "./localize.js";
import { parseFiddle, parseFiddleFromZip } from "./parse-fiddle.js";
import { createRequirementContext } from "./requirements.js";
import { REVIEWED_PIPELINE_DIAGNOSTICS } from "./reviewed-diagnostics.js";

import type { ZipFile } from "yauzl-promise";

import type { LocaleCode } from "#lib/types/locale.js";
import type { Item, ItemId, QuestId, TrackerData, VillagerId } from "#lib/types/tracker-data.js";

import type { SpriteExtractionResult, StagedSprite } from "./extractors/sprites.js";
import type { ParsedGameData } from "./parse-fiddle.js";

const __dirname = import.meta.dirname;
const PIPELINE_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(PIPELINE_ROOT, "output");
const APP_DATA_DIR = resolve(PIPELINE_ROOT, "..", "src", "lib", "data");
const OUTPUT_FILE = "tracker-data.json";
const SPRITES_OUTPUT_ROOT = resolve(OUTPUT_DIR, "sprites");

interface StagedFile {
  content: string;
  path: string;
}

/**
 * Builds the reference index from extracted registries, parsed game tables, and the explicit
 * reviewed non-native IDs. Acquisition sources never contribute IDs, so an override or collector
 * that names a nonexistent quest, monster, or location fails validation instead of registering its
 * own typo.
 */
function buildAcquisitionReferences(
  trackerData: TrackerData,
  fiddle: ParsedGameData,
): AcquisitionReferenceIndex {
  return AcquisitionReferenceIndex.from({
    emitted: {
      cosmetics: trackerData.cosmetics,
      items: trackerData.items,
      recipes: trackerData.recipes,
    },
    excluded: {
      cosmetics: getExcludedCosmeticIds(),
    },
    native: {
      ...collectNativeReferenceRegistries(fiddle),
      animals: trackerData.animals,
      biomes: trackerData.mines.biomes,
      festivals: trackerData.festivals,
      perks: collectPerkIds(trackerData),
      questTypes: Object.keys(trackerData.quests),
      skills: trackerData.skills,
      stores: trackerData.stores,
      villagers: trackerData.villagers,
      wings: trackerData.museum,
    },
    reviewed: REVIEWED_NON_NATIVE_REFERENCES,
  });
}

function collectPerkIds(trackerData: TrackerData): string[] {
  return Object.values(trackerData.skills).flatMap((skill) =>
    skill.perkTiers.flatMap((tier) => Object.keys(tier)),
  );
}

/** Logs sprite extraction results for a given entity kind. */
function logSpriteExtraction(label: string, result: SpriteExtractionResult): void {
  console.log(
    `  ${label}: extracted ${result.extracted} new, ${result.skipped} unchanged, ${result.total} total`,
  );
}

async function main(): Promise<void> {
  console.log("📚 Mistria Field Guide — Data Pipeline\n");

  const args = process.argv.slice(2).filter((a) => a !== "--");
  const assetsDir =
    args.find((a) => !a.startsWith("-")) ??
    process.env.MISTRIA_ASSETS ??
    (existsSync(DEFAULT_WINDOWS_STEAM_ASSETS_DIR) ? DEFAULT_WINDOWS_STEAM_ASSETS_DIR : undefined);
  if (!assetsDir) {
    console.error("Usage: tsx src/main.ts <path-to-assets-dir> [--version=X.Y.Z]");
    console.error("  Or set MISTRIA_ASSETS environment variable");
    console.error(`  Or install the game at its default Steam location on Windows:`);
    console.error(`    ${DEFAULT_WINDOWS_STEAM_ASSETS_DIR}`);
    process.exitCode = 1;
    return;
  }

  assertGameLanguageMapExhaustive(assetsDir);
  const diagnostics = new PipelineDiagnostics(REVIEWED_PIPELINE_DIAGNOSTICS);

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

  const parseOnly = args.includes("--parse-only");
  const villagerSpritesOnly = args.includes("--villager-sprites-only");
  const versionFlag = args.find((a) => a.startsWith("--version="));
  const versionArg = versionFlag?.split("=")[1];

  console.log("Step 1: Parsing TOML data...");
  const parsed =
    fiddleSource.kind === "disk"
      ? parseFiddle(assetsDir)
      : await parseFiddleFromZip(fiddleSource.zipPath, villagerSpritesOnly ? ["npcs"] : undefined);
  const fiddle = parsed.data;

  if (fiddleSource.kind === "zip" && !villagerSpritesOnly) {
    console.error("❌ Full pipeline extraction requires an on-disk fiddle/ directory.");
    console.error(
      "   Extract your game assets first, or use --villager-sprites-only to regenerate villager sprites from assets.zip.",
    );
    process.exitCode = 1;
    return;
  }

  if (villagerSpritesOnly) {
    await runVillagerSpritesOnly(fiddle, assetsDir);
    return;
  }

  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const version =
    versionArg ??
    (misc?.version as string | undefined) ??
    readInstalledGameVersion(resolveAssetsZipPath(assetsDir));
  if (!version) {
    console.error("❌ No game version found. Pass --version=X.Y.Z or ensure misc.version exists.");
    process.exitCode = 1;
    return;
  }
  console.log(`  Game version: ${version}\n`);

  if (parseOnly) {
    if (parsed.fileCount !== 297) {
      console.error(`  ❌ Expected 297 files, got ${parsed.fileCount}`);
      process.exitCode = 1;
      return;
    }
    const checks = ["items.other.cooked_dishes", "npcs.holt", "dungeons.dungeons.biomes"];
    for (const path of checks) {
      const parts = path.split(".");
      let current: unknown = fiddle;
      for (const part of parts) {
        current = (current as Record<string, unknown>)?.[part];
      }
      if (current === undefined) {
        console.error(`  ❌ Missing representative path: ${path}`);
        process.exitCode = 1;
        return;
      }
    }
    console.log("  ✅ Parse-only smoke test passed");
    return;
  }

  console.log("Step 2: Evaluating expressions...");
  evaluateExpressions(fiddle);
  console.log();

  console.log("Step 3: Extracting tracker data...");
  const { localeNames: museumLocaleNames, museum } = extractMuseum(fiddle, assetsDir);
  const cutsceneQuestMap = buildCutsceneQuestMap(fiddle);
  const { recipeIdByItemId, recipeMemberItems, recipeNameSources, recipes } = extractRecipes(
    fiddle,
    cutsceneQuestMap,
    diagnostics,
  );
  const {
    almanac,
    iconSpritesByItemId,
    items,
    localeNames: itemLocaleNames,
  } = extractAlmanac(fiddle, assetsDir, diagnostics);
  const recipeLocaleNames = deriveRecipeLocaleNames(recipeNameSources, itemLocaleNames);
  const { animals, localeNames: animalLocaleNames } = extractAnimals(fiddle, assetsDir);
  const { cosmetics: petCosmetics, localeNames: petCosmeticLocaleNames } = extractPetCosmetics(
    fiddle,
    assetsDir,
  );
  const { localeNames: petSkinLocaleNames, skins: petSkins } = extractPetSkins(
    fiddle,
    itemLocaleNames,
  );
  const {
    iconSpritesByVillagerId,
    localeNames: villagerLocaleNames,
    villagers,
  } = extractVillagers(fiddle, assetsDir);
  const {
    cosmetics,
    cosmeticSlots,
    localeNames: cosmeticLocaleNames,
    subCategoryLocaleNames: cosmeticSubCategoryLocaleNames,
  } = extractCosmetics(fiddle, assetsDir);
  const {
    localeNames: skillLocaleNames,
    perkLocaleNames,
    perkTierLevels,
    skills,
  } = extractSkills(fiddle, assetsDir);
  const { localeNames: townRankLocaleNames, townRanks } = extractTownRanks(fiddle, assetsDir);
  const { localeNames: questLocaleNames, quests } = extractQuests(
    fiddle,
    assetsDir,
    recipeIdByItemId,
  );
  const {
    biomeLocaleNames: mineLocaleNames,
    mines,
    spellLocaleNames,
  } = extractMines(fiddle, assetsDir);
  const { localeNames: storeLocaleNames, stores: storesMeta } = extractStoresMeta(
    fiddle,
    assetsDir,
  );
  const { dates, localeNames: dateLocaleNames } = extractDates(fiddle, assetsDir);
  const { festivals, localeNames: festivalLocaleNames } = extractFestivals(fiddle, assetsDir);
  const { localeNames: treasureChestTierLocaleNames, tiers: treasureChestTiers } =
    extractTreasureChestTiers(fiddle, assetsDir);
  const maxVariantTiers = Math.max(
    0,
    ...Object.values(animals).map((animal) => animal.variantTiers.length),
  );
  const { localeNames: uiLocaleNames } = extractUiStrings(fiddle, assetsDir, [
    ...APP_UI_STRINGS,
    ...readAlmanacCategories(fiddle).map((category) => ({
      id: category.key,
      miscLocalKey: category.localKey,
    })),
    ...tierKeys(maxVariantTiers),
  ]);

  const requirementContext = createRequirementContext(
    fiddle.requirements as Record<string, unknown> | undefined,
    cutsceneQuestMap,
  );

  const itemSources = new ItemSourceAccumulator();
  const cosmeticSources = new CosmeticSourceAccumulator();
  const animalCosmeticSources = new AnimalCosmeticSourceAccumulator();
  const petCosmeticSources = new PetCosmeticSourceAccumulator();
  deriveRecipeProductSources(fiddle, recipeMemberItems, itemSources);
  collectNaturalSources(fiddle, itemSources, cosmeticSources, petCosmeticSources, diagnostics);
  collectRewardSources(
    fiddle,
    itemSources,
    cosmeticSources,
    animalCosmeticSources,
    petCosmeticSources,
  );
  collectStoreSources(
    fiddle,
    requirementContext,
    itemSources,
    cosmeticSources,
    animalCosmeticSources,
  );
  collectExplorationSources(fiddle, itemSources, cosmeticSources);
  collectDefaultItemSources(fiddle, itemSources, items);
  collectDefaultCosmeticSources(cosmetics, cosmeticSources);

  const overrideDiagnostics = applyReviewedOverrides(
    items,
    cosmetics,
    itemSources,
    cosmeticSources,
  );
  for (const diagnostic of overrideDiagnostics) {
    diagnostics.add({ ...diagnostic, fieldPath: `${diagnostic.namespace}.${diagnostic.targetId}` });
  }

  // Attach inline acquisition sources to items
  for (const [itemId, sources] of itemSources.entries()) {
    const item = items[itemId];
    if (item && isNonEmptyArray(sources)) {
      (item as Item).sources = sources;
    }
  }

  // Attach inline acquisition sources to cosmetics
  for (const [cosmeticId, sources] of cosmeticSources.entries()) {
    const cosmetic = cosmetics[cosmeticId];
    if (cosmetic && isNonEmptyArray(sources)) {
      cosmetic.sources = sources;
    }
  }

  // Attach sources to animal cosmetics
  for (const { animalId, cosmeticId, sources } of animalCosmeticSources.animalCosmeticEntries()) {
    const animal = animals[animalId];
    if (!animal) continue;
    const cosmetic = animal.cosmetics[cosmeticId];
    if (!cosmetic) continue;
    const merged = [...cosmetic.sources, ...sources];
    if (isNonEmptyArray(merged)) {
      cosmetic.sources = merged;
    }
  }

  // Attach sources to pet cosmetic sets
  for (const [setId, sources] of petCosmeticSources.entries()) {
    const set = petCosmetics[setId];
    if (set && isNonEmptyArray(sources)) {
      set.sources = sources;
    }
  }

  // Attach sources to pet skins by finding items with matching pet_skin_unlock field
  const petSkinItemMap = new Map<string, string>();
  forEachItem(fiddle, (itemId, item) => {
    const skinUnlock = item.pet_skin_unlock as string | undefined;
    if (skinUnlock) {
      petSkinItemMap.set(skinUnlock, itemId);
    }
  });
  for (const [skinId, skin] of Object.entries(petSkins)) {
    const itemId = petSkinItemMap.get(skinId);
    if (itemId) {
      const itemSrc = itemSources.get(itemId as ItemId);
      if (isNonEmptyArray(itemSrc)) {
        skin.sources = itemSrc;
      }
    }
  }

  // Log inline source attachment stats
  const itemsWithSources = Object.values(items).filter((i) => (i as Item).sources?.length).length;
  const cosmeticsWithSources = Object.values(cosmetics).filter((c) => c.sources?.length).length;
  const recipesWithSources = Object.values(recipes).filter((r) => r.sources?.length).length;
  const animalCosmeticsWithSources = Object.values(animals).reduce(
    (n, a) => n + Object.values(a.cosmetics).filter((c) => c.sources.length > 0).length,
    0,
  );
  const totalAnimalCosmetics = Object.values(animals).reduce(
    (n, a) => n + Object.keys(a.cosmetics).length,
    0,
  );
  const petCosmeticsWithSources = Object.values(petCosmetics).filter(
    (c) => c.sources.length > 0,
  ).length;
  const petSkinsWithSources = Object.values(petSkins).filter((s) => s.sources.length > 0).length;
  console.log(
    `  Inline sources: ${itemsWithSources}/${Object.keys(items).length} items, ` +
      `${cosmeticsWithSources}/${Object.keys(cosmetics).length} cosmetics, ` +
      `${recipesWithSources}/${Object.keys(recipes).length} recipes, ` +
      `${animalCosmeticsWithSources}/${totalAnimalCosmetics} animal cosmetics, ` +
      `${petCosmeticsWithSources}/${Object.keys(petCosmetics).length} pet cosmetics, ` +
      `${petSkinsWithSources}/${Object.keys(petSkins).length} pet skins`,
  );

  console.log();

  console.log("Step 3b: Extracting visibility data...");
  const questChainsRaw = extractQuestChains(fiddle);
  const heartLevelChangesData = extractHeartLevelChanges(fiddle, cutsceneQuestMap);
  const categoryVisibilityData = extractCategoryVisibility(villagers);

  for (const [questId, changes] of recordEntries(heartLevelChangesData)) {
    const quest = quests.story[questId];
    if (quest) {
      quest.heartLevelChanges = changes;
    }
  }
  console.log();

  console.log("Step 4: Assembling tracker-data.json...");
  const pregnancyQuestByVillager: Partial<Record<VillagerId, QuestId>> = {};
  for (const [questId, quest] of Object.entries(quests.heart)) {
    if (questId.endsWith("_pregnancy_request")) {
      pregnancyQuestByVillager[(quest as { villager: VillagerId }).villager] = questId as QuestId;
    }
  }

  const trackerData: TrackerData = {
    almanac,
    animals,
    categoryVisibility: categoryVisibilityData,
    cosmetics,
    cosmeticSlots,
    dates,
    festivals,
    generatedAt: new Date().toISOString(),
    items: items as unknown as Record<ItemId, Item>,
    mines,
    museum,
    perkTierLevels,
    pets: { cosmetics: petCosmetics, skins: petSkins },
    pregnancyQuestByVillager,
    questOrder: {
      cooking: questChainsRaw.tali,
      crown: questChainsRaw.crown,
      mission: questChainsRaw.stillwell,
    },
    quests,
    recipes,
    skills,
    stores: storesMeta,
    townRanks,
    treasureChestTiers,
    version,
    villagers,
  };

  stampVillagerVisibility(trackerData);
  stampStoreVisibility(trackerData);
  assignEntityVisibility(trackerData, cutsceneQuestMap, fiddle, questChainsRaw);

  // Validation is the last step before serialization: visibility assignment rewrites sources and
  // injects hard-coded quest gates, so validating any earlier would miss the emitted shape.
  diagnostics.validate();
  validateAcquisitionSources(trackerData, buildAcquisitionReferences(trackerData, fiddle));
  console.log("  Tracker data validation passed");

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

  stageLocaleChunks(staged, "villagers", villagerLocaleNames);
  stageLocaleChunks(staged, "dates", dateLocaleNames);
  stageLocaleChunks(staged, "festivals", festivalLocaleNames);
  stageLocaleChunks(staged, "museum_wings", museumLocaleNames);
  stageLocaleChunks(staged, "perks", perkLocaleNames);
  stageLocaleChunks(staged, "pets/cosmetic_sets", petCosmeticLocaleNames);
  stageLocaleChunks(staged, "quests", questLocaleNames);
  stageLocaleChunks(staged, "skills", skillLocaleNames);
  stageLocaleChunks(staged, "spells", spellLocaleNames);
  stageLocaleChunks(staged, "stores", storeLocaleNames);
  stageLocaleChunks(staged, "animals", animalLocaleNames);
  stageLocaleChunks(staged, "cosmetics", cosmeticLocaleNames);
  stageLocaleChunks(staged, "cosmetics/subcategories", cosmeticSubCategoryLocaleNames);
  stageLocaleChunks(staged, "ui", uiLocaleNames);
  stageLocaleChunks(staged, "mines", mineLocaleNames);
  stageLocaleChunks(staged, "town-ranks", townRankLocaleNames);
  stageLocaleChunks(staged, "items", itemLocaleNames);
  stageLocaleChunks(staged, "recipes", recipeLocaleNames);
  stageLocaleChunks(staged, "pets/skins", petSkinLocaleNames);
  stageLocaleChunks(staged, "treasure-chest-tiers", treasureChestTierLocaleNames);

  const fiddlePretty = JSON.stringify(fiddle, null, 2);
  staged.push({ content: fiddlePretty, path: resolve(OUTPUT_DIR, "fiddle-readable.json") });
  console.log(
    `  Staged: pipeline/output/fiddle-readable.json (${(fiddlePretty.length / 1024 / 1024).toFixed(1)} MB)`,
  );

  staged.push({ content: prettyJson, path: resolve(OUTPUT_DIR, "tracker-data-readable.json") });
  console.log(
    `  Staged: pipeline/output/tracker-data-readable.json (${(prettyJson.length / 1024).toFixed(1)} KB)`,
  );

  let stagedSprites: StagedSprite[] = [];
  const extractSpritesFlag = args.includes("--sprites");
  const zipPath = resolveAssetsZipPath(resolve(assetsDir));
  if (extractSpritesFlag) {
    console.log("\nStep 6: Extracting item and villager sprites...");
    const zipFile: undefined | ZipFile = zipPath ? await open(zipPath) : undefined;
    if (zipPath) console.log(`  Reading sprites from ${zipPath}`);
    try {
      const itemSpriteResult = await extractSprites(
        resolve(assetsDir),
        iconSpritesByItemId,
        SPRITES_OUTPUT_ROOT,
        zipPath,
        zipFile,
      );
      const villagerSpriteResult = await extractVillagerSprites(
        resolve(assetsDir),
        iconSpritesByVillagerId,
        SPRITES_OUTPUT_ROOT,
        zipPath,
        zipFile,
      );
      logSpriteExtraction("Items", itemSpriteResult);
      logSpriteExtraction("Villagers", villagerSpriteResult);
      const missing = [...itemSpriteResult.missing, ...villagerSpriteResult.missing];
      if (reportMissingSprites(missing)) return;
      stagedSprites = [...itemSpriteResult.staged, ...villagerSpriteResult.staged];
    } finally {
      if (zipFile) await zipFile.close();
    }
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

/** Writes staged text outputs to disk. Call only after every pipeline validation passes. */
function publishFiles(staged: readonly StagedFile[]): void {
  for (const { content, path } of staged) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
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
function stageLocaleChunks(
  staged: StagedFile[],
  category: string,
  byLocale: Record<LocaleCode, Record<string, string>>,
) {
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
