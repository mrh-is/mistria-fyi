/**
 * The pipeline parses, evaluates in place, extracts, applies post-extraction quest gates, then
 * assembles and serializes output. Writes begin only after every transformation succeeds.
 * --parse-only is a v1.0.2-specific smoke test that exits before evaluation.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectExplorationSources } from "./acquisition/collectors/exploration.js";
import { collectNaturalSources } from "./acquisition/collectors/natural.js";
import { collectRewardSources } from "./acquisition/collectors/rewards.js";
import { collectStoreSources } from "./acquisition/collectors/stores.js";
import { deriveRecipeProductSources } from "./acquisition/recipe-products.js";
import {
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
} from "./acquisition/source-accumulator.js";
import { evaluateExpressions } from "./evaluate.js";
import { extractAlmanac } from "./extractors/almanac.js";
import { extractAnimals } from "./extractors/animals.js";
import { extractCosmetics } from "./extractors/cosmetics.js";
import { extractFestivals } from "./extractors/festivals.js";
import { extractMines } from "./extractors/mines.js";
import { extractMuseum } from "./extractors/museum.js";
import { extractNpcs } from "./extractors/npcs.js";
import { extractPerks } from "./extractors/perks.js";
import {
  applyAnimalQuestGates,
  applyItemQuestGates,
  applySpellQuestGates,
  extractQuestGates,
} from "./extractors/quest-gates.js";
import { extractQuests } from "./extractors/quests.js";
import { extractRecipes } from "./extractors/recipes.js";
import { extractRenown } from "./extractors/renown.js";
import { extractSkills } from "./extractors/skills.js";
import { extractSources } from "./extractors/sources.js";
import { extractStoresMeta } from "./extractors/stores-meta.js";
import { extractTreasureChestTiers } from "./extractors/treasure-chest-tiers.js";
import { buildCutsceneQuestMap } from "./extractors/visibility/cutscene-quest-map.js";
import {
  assignEntityVisibility,
  extractCategoryVisibility,
  extractFetchQuestVisibility,
  extractHeartLevelChanges,
  extractNpcVisibility,
  extractStoreVisibility,
} from "./extractors/visibility/entity-visibility.js";
import { extractQuestChains } from "./extractors/visibility/quest-chains.js";
import { parseFiddle } from "./parse-fiddle.js";
import { createRequirementContext } from "./requirements.js";

import type { ItemId, TrackerData } from "$lib/types/tracker-data.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(PIPELINE_ROOT, "output");
const APP_DATA_DIR = resolve(PIPELINE_ROOT, "..", "src", "lib", "data");
const OUTPUT_FILE = "tracker-data.json";

function main(): void {
  console.log("🌾 Harvest Helper — Data Pipeline\n");

  const args = process.argv.slice(2).filter((a) => a !== "--");
  const assetsDir = args.find((a) => !a.startsWith("-")) ?? process.env.MISTRIA_ASSETS;
  if (!assetsDir) {
    console.error("Usage: tsx src/main.ts <path-to-assets-dir> [--version=X.Y.Z]");
    console.error("  Or set MISTRIA_ASSETS environment variable");
    process.exit(1);
  }

  const fiddleDir = resolve(assetsDir, "fiddle");
  if (!existsSync(fiddleDir)) {
    console.error(`❌ Missing input: ${fiddleDir}`);
    console.error("   Pass the path to the assets directory containing fiddle/");
    process.exit(1);
  }

  const parseOnly = args.includes("--parse-only");
  const versionFlag = args.find((a) => a.startsWith("--version="));
  const versionArg = versionFlag?.split("=")[1];

  console.log("Step 1: Parsing TOML data...");
  const parsed = parseFiddle(assetsDir);
  const fiddle = parsed.data;

  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const version = versionArg ?? (misc?.version as string | undefined);
  if (!version) {
    console.error("❌ No game version found. Pass --version=X.Y.Z or ensure misc.version exists.");
    process.exit(1);
  }
  console.log(`  Game version: ${version}\n`);

  if (parseOnly) {
    if (parsed.fileCount !== 295) {
      console.error(`  ❌ Expected 295 files, got ${parsed.fileCount}`);
      process.exit(1);
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
        process.exit(1);
      }
    }
    console.log("  ✅ Parse-only smoke test passed");
    return;
  }

  console.log("Step 2: Evaluating expressions...");
  evaluateExpressions(fiddle);
  console.log();

  console.log("Step 3: Extracting tracker data...");
  const museum = extractMuseum(fiddle);
  const cutsceneQuestMap = buildCutsceneQuestMap(fiddle);
  const { recipeIdByItemId, recipes } = extractRecipes(fiddle, cutsceneQuestMap);
  const { almanac, items } = extractAlmanac(fiddle, recipeIdByItemId);
  const animals = extractAnimals(fiddle);
  const npcs = extractNpcs(fiddle);
  const cosmetics = extractCosmetics(fiddle);
  const skills = extractSkills(fiddle);
  const renown = extractRenown(fiddle);
  const quests = extractQuests(fiddle);
  const mines = extractMines(fiddle);
  const sources = extractSources(fiddle);
  const questGates = extractQuestGates(fiddle);
  const { perks, perkTierLevels } = extractPerks(fiddle);
  const storesMeta = extractStoresMeta(fiddle);
  const festivals = extractFestivals(fiddle);
  const treasureChestTiers = extractTreasureChestTiers(fiddle);

  const requirementContext = createRequirementContext(
    fiddle.requirements as Record<string, unknown> | undefined,
    cutsceneQuestMap,
  );

  const itemSources = new ItemSourceAccumulator();
  const cosmeticSources = new CosmeticSourceAccumulator();
  deriveRecipeProductSources(fiddle, recipes, itemSources);
  collectNaturalSources(fiddle, itemSources);
  collectRewardSources(fiddle, itemSources, cosmeticSources);
  collectStoreSources(fiddle, requirementContext, itemSources);
  collectExplorationSources(fiddle, itemSources, cosmeticSources);

  applyItemQuestGates(items, questGates.itemGates);
  applyAnimalQuestGates(animals, questGates.animalGates);
  applySpellQuestGates(mines, questGates.spellGates);

  for (const [itemId, recipeId] of recipeIdByItemId) {
    const typedId = itemId as ItemId;
    const item = items[typedId];
    if (item) {
      (items as TrackerData["items"])[typedId] = { ...item, recipeId };
    }
  }
  console.log();

  console.log("Step 3b: Extracting visibility data...");
  const questChainsRaw = extractQuestChains(fiddle);
  const storeVisibilityData = extractStoreVisibility(fiddle);
  const npcVisibilityData = extractNpcVisibility();
  const heartLevelChangesData = extractHeartLevelChanges(fiddle, cutsceneQuestMap);
  const categoryVisibilityData = extractCategoryVisibility();
  const fetchQuestVisibilityData = extractFetchQuestVisibility(
    questChainsRaw.fetch,
    cutsceneQuestMap,
  );
  console.log();

  console.log("Step 4: Assembling tracker-data.json...");
  const trackerData: TrackerData = {
    almanac,
    animals,
    categoryVisibility: categoryVisibilityData,
    cosmetics,
    festivals,
    generatedAt: new Date().toISOString(),
    heartLevelChanges: heartLevelChangesData,
    items,
    mines,
    museum,
    npcs,
    npcVisibility: npcVisibilityData,
    perks,
    perkTierLevels,
    questChains: { ...questChainsRaw, fetch: fetchQuestVisibilityData },
    questGates,
    quests,
    recipes,
    renown,
    skills,
    sources,
    stores: storesMeta,
    storeVisibility: storeVisibilityData,
    treasureChestTiers,
    version,
  };

  // Task 13 enables validateAcquisitionSources(trackerData, acquisitionReferences) here, after
  // every canonical registry has cut over to inline acquisition sources and before visibility.

  // Mutate trackerData in place: stamps visibility on items, recipes, perks, cosmetics, animals,
  // spells, and quests.
  assignEntityVisibility(
    trackerData,
    storeVisibilityData,
    cutsceneQuestMap,
    fiddle,
    questChainsRaw,
  );

  const json = JSON.stringify(trackerData);
  const prettyJson = JSON.stringify(trackerData, null, 2);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(resolve(OUTPUT_DIR, OUTPUT_FILE), prettyJson);
  console.log(
    `  Written: pipeline/output/${OUTPUT_FILE} (${(prettyJson.length / 1024).toFixed(1)} KB pretty)`,
  );

  mkdirSync(APP_DATA_DIR, { recursive: true });
  writeFileSync(resolve(APP_DATA_DIR, OUTPUT_FILE), json);
  console.log(
    `  Copied:  src/lib/data/${OUTPUT_FILE} (${(json.length / 1024).toFixed(1)} KB minified)`,
  );

  console.log("\nStep 5: Writing human-readable outputs...");

  const fiddlePretty = JSON.stringify(fiddle, null, 2);
  writeFileSync(resolve(OUTPUT_DIR, "fiddle-readable.json"), fiddlePretty);
  console.log(
    `  Written: pipeline/output/fiddle-readable.json (${(fiddlePretty.length / 1024 / 1024).toFixed(1)} MB)`,
  );

  writeFileSync(resolve(OUTPUT_DIR, "tracker-data-readable.json"), prettyJson);
  console.log(
    `  Written: pipeline/output/tracker-data-readable.json (${(prettyJson.length / 1024).toFixed(1)} KB)`,
  );

  console.log("\n✅ Pipeline complete!");
}

main();
