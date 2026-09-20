/**
 * The pipeline parses, evaluates in place, extracts, assembles, and serializes output. Writes begin only after every transformation succeeds.
 * --parse-only is a v1.0.2-specific smoke test that exits before evaluation.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LOCALE_CODES } from "$lib/types/locale.js";
import { recordEntries } from "$lib/utils.js";
import { isNonEmptyArray } from "$lib/utils.js";

import { collectExplorationSources } from "./acquisition/collectors/exploration";
import { collectNaturalSources } from "./acquisition/collectors/natural";
import { collectRewardSources } from "./acquisition/collectors/rewards";
import { collectStoreSources } from "./acquisition/collectors/stores";
import { applyExclusions } from "./acquisition/exclusions";
import { deriveRecipeProductSources } from "./acquisition/recipe-products";
import { AcquisitionReferenceIndex } from "./acquisition/reference-index";
import {
  applyReviewedOverrides,
  collectDefaultCosmeticSources,
  collectDefaultItemSources,
} from "./acquisition/reviewed-overrides";
import {
  AnimalCosmeticSourceAccumulator,
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
  PetCosmeticSourceAccumulator,
} from "./acquisition/source-accumulator";
import {
  type AcquisitionSourceAssembly,
  validateAcquisitionSources,
} from "./acquisition/validate-sources";
import { evaluateExpressions } from "./evaluate";
import { forEachItem } from "./extractor-helpers";
import { extractAlmanac, readAlmanacCategories } from "./extractors/almanac";
import { extractAnimals } from "./extractors/animals";
import { extractCosmetics } from "./extractors/cosmetics";
import { extractDates } from "./extractors/dates";
import { extractFestivals } from "./extractors/festivals";
import { extractMines } from "./extractors/mines";
import { extractMuseum } from "./extractors/museum";
import { extractPetCosmetics, extractPetSkins } from "./extractors/pets";
import { extractQuests } from "./extractors/quests";
import { deriveRecipeLocaleNames, extractRecipes } from "./extractors/recipes";
import { extractTownRanks } from "./extractors/renown";
import { extractSkills } from "./extractors/skills";
import { extractSprites, publishSprites } from "./extractors/sprites";
import { extractStoresMeta } from "./extractors/stores-meta";
import { extractTreasureChestTiers } from "./extractors/treasure-chest-tiers";
import { APP_UI_STRINGS, extractUiStrings, tierKeys } from "./extractors/ui-strings";
import { extractVillagers } from "./extractors/villagers";
import { buildCutsceneQuestMap } from "./extractors/visibility/cutscene-quest-map";
import {
  assignEntityVisibility,
  extractCategoryVisibility,
  extractHeartLevelChanges,
  stampStoreVisibility,
  stampVillagerVisibility,
} from "./extractors/visibility/entity-visibility";
import { extractQuestChains } from "./extractors/visibility/quest-chains";
import { generateLocaleManifest } from "./localize";
import { parseFiddle } from "./parse-fiddle";
import { createRequirementContext } from "./requirements";

import type { Source as AcquisitionSource } from "$lib/types/acquisition.js";
import type { LocaleCode } from "$lib/types/locale.js";
import type {
  CosmeticId,
  Item,
  ItemId,
  QuestId,
  TrackerData,
  VillagerId,
} from "$lib/types/tracker-data.js";

import type { StagedSprite } from "./extractors/sprites";
import type { ParsedGameData } from "./parse-fiddle";
const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(PIPELINE_ROOT, "output");
const APP_DATA_DIR = resolve(PIPELINE_ROOT, "..", "src", "lib", "data");
const OUTPUT_FILE = "tracker-data.json";
const SPRITES_OUTPUT_ROOT = resolve(OUTPUT_DIR, "sprites");

interface StagedFile {
  content: string;
  path: string;
}

function buildAcquisitionReferences(
  trackerData: TrackerData,
  fiddle: ParsedGameData,
  cosmeticsRaw: Record<string, unknown>,
  cosmetics: Record<CosmeticId, unknown>,
  itemSources: ItemSourceAccumulator,
  cosmeticSources: CosmeticSourceAccumulator,
): AcquisitionReferenceIndex {
  const nativeIds = collectNativeIdsFromSources(itemSources, cosmeticSources, trackerData);

  const nativeQuestIds = [
    ...extractNestedFiddleKeys(fiddle, "quests"),
    ...extractFiddleKeys(fiddle, "cutscenes"),
  ];
  const fishing = fiddle.fishing as Record<string, unknown> | undefined;
  const chestTables = (fishing?.chest_tables ?? {}) as Record<string, unknown>;
  const nativeChestTiers = Object.keys(chestTables).filter((k) => k !== "default");

  return AcquisitionReferenceIndex.from({
    emitted: {
      cosmetics: trackerData.cosmetics,
      items: trackerData.items,
      recipes: trackerData.recipes,
    },
    excluded: {
      cosmetics: Object.keys(cosmeticsRaw)
        .filter((id) => !(id in cosmetics))
        .reduce<Record<string, unknown>>((acc, id) => ({ ...acc, [id]: true }), {}),
    },
    native: {
      activities: nativeIds.activities,
      animals: trackerData.animals,
      biomes: trackerData.mines.biomes,
      dates: nativeIds.dates,
      dialogueChoices: nativeIds.dialogueChoices,
      dungeonLootGroups: nativeIds.dungeonLootGroups,
      festivals: trackerData.festivals,
      items: trackerData.items,
      locations: nativeIds.locations,
      monsters: nativeIds.monsters,
      perks: Object.values(trackerData.skills).reduce<Record<string, unknown>>((acc, skill) => {
        for (const tier of skill.perkTiers) {
          for (const perkId of Object.keys(tier)) acc[perkId] = true;
        }
        return acc;
      }, {}),
      quests: { ...nativeIds.quests, ...toRecord(nativeQuestIds), ...trackerData.quests },
      questTypes: nativeIds.questTypes,
      skills: trackerData.skills,
      stations: nativeIds.stations,
      stores: trackerData.stores,
      treasureChestTiers: { ...toRecord(nativeChestTiers), ...trackerData.treasureChestTiers },
      villagers: trackerData.villagers,
      waterTypes: nativeIds.waterTypes,
      wings: trackerData.museum,
    },
  });
}

function collectNativeIdsFromSources(
  itemSources: ItemSourceAccumulator,
  cosmeticSources: CosmeticSourceAccumulator,
  trackerData: TrackerData,
): Record<string, Record<string, true>> {
  const sets: Record<string, Set<string>> = {
    activities: new Set(),
    dates: new Set(),
    dialogueChoices: new Set(),
    dungeonLootGroups: new Set(),
    locations: new Set(),
    monsters: new Set(),
    quests: new Set(),
    questTypes: new Set(),
    stations: new Set(),
    waterTypes: new Set(),
  };

  const allSources: AcquisitionSource[] = [];
  for (const [, sources] of itemSources.entries()) {
    allSources.push(...sources);
  }
  for (const [, sources] of cosmeticSources.entries()) {
    allSources.push(...sources);
  }
  for (const recipe of Object.values(trackerData.recipes)) {
    allSources.push(...recipe.sources);
  }

  for (const source of allSources) {
    switch (source.type) {
      case "animal_product":
      case "artifact_replicator":
      case "bait_fish":
      case "beach_cave_chest":
      case "breed":
        break;
      case "artifact_dig":
      case "bug_catch":
        source.locationIds?.forEach((id) => sets.locations.add(id));
        break;
      case "chicken_statue":
      case "crop":
        break;
      case "date":
        sets.dates.add(source.dateId);
        break;
      case "date_inspiration":
      case "default":
        break;
      case "dive":
        source.waterTypes?.forEach((id) => sets.waterTypes.add(id));
        break;
      case "donate_item":
      case "lost_and_found":
      case "mine":
      case "mine_fish":
      case "reach_day":
      case "ship_item":
        break;
      case "engagement":
      case "equipment":
      case "festival":
        break;
      case "festival_activity":
        sets.activities.add(source.activityId);
        break;
      case "fish":
        source.waterTypes?.forEach((id) => sets.waterTypes.add(id));
        break;
      case "fish_trap":
        break;
      case "forage":
        source.locationIds?.forEach((id) => sets.locations.add(id));
        break;
      case "mines_chest":
        if (source.lootGroup) sets.dungeonLootGroups.add(source.lootGroup);
        break;
      case "mines_dig_site":
        break;
      case "monster":
      case "monster_feed":
        sets.monsters.add(source.monsterId);
        break;
      case "museum_donation":
      case "perk":
      case "perk_drop":
      case "proposal":
      case "spouseGift":
        break;
      case "quest":
        sets.quests.add(source.questId);
        if (source.questType) sets.questTypes.add(source.questType);
        if (source.choiceId) sets.dialogueChoices.add(source.choiceId);
        break;
      case "recipe":
      case "renown":
      case "ritual_chamber":
      case "scroll_bundle":
        break;
      case "station":
        sets.stations.add(source.stationId);
        break;
      case "store":
      case "treasure_chest":
      case "tree":
      case "upgrade":
      case "wedding":
      case "wishing_well":
        break;
    }
  }

  return Object.fromEntries(
    Object.entries(sets).map(([key, set]) => [
      key,
      Object.fromEntries([...set].map((id) => [id, true as const])),
    ]),
  );
}

function extractFiddleKeys(fiddle: ParsedGameData, topKey: string): string[] {
  const raw = fiddle[topKey] as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return [];
  const nested = raw[topKey] as Record<string, unknown> | undefined;
  const target = nested ?? raw;
  return Object.keys(target).filter((k) => k !== "default");
}

function extractNestedFiddleKeys(fiddle: ParsedGameData, topKey: string): string[] {
  const raw = fiddle[topKey] as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return [];
  const keys: string[] = [];
  for (const child of Object.values(raw)) {
    if (child && typeof child === "object") {
      keys.push(...Object.keys(child as Record<string, unknown>).filter((k) => k !== "default"));
    }
  }
  return keys;
}

async function main(): Promise<void> {
  console.log("📚 Mistria Field Guide — Data Pipeline\n");

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
  const { localeNames: museumLocaleNames, museum } = extractMuseum(fiddle, assetsDir);
  const cutsceneQuestMap = buildCutsceneQuestMap(fiddle);
  const { recipeIdByItemId, recipeMemberItems, recipeNameSources, recipes } = extractRecipes(
    fiddle,
    cutsceneQuestMap,
  );
  const { almanac, items, localeNames: itemLocaleNames } = extractAlmanac(fiddle, assetsDir);
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
  const { localeNames: villagerLocaleNames, villagers } = extractVillagers(fiddle, assetsDir);
  const {
    cosmetics: cosmeticsRaw,
    cosmeticSlots,
    localeNames: cosmeticLocaleNames,
    subCategoryLocaleNames: cosmeticSubCategoryLocaleNames,
  } = extractCosmetics(fiddle, assetsDir);
  const cosmetics = applyExclusions(cosmeticsRaw);
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
  collectNaturalSources(fiddle, itemSources, cosmeticSources, petCosmeticSources);
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
  for (const d of overrideDiagnostics) {
    if (d.kind === "obsolete-override") {
      throw new Error(`Obsolete override: ${d.message}`);
    }
    console.log(`  Warning: ${d.message}`);
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

  const acquisitionReferences = buildAcquisitionReferences(
    trackerData,
    fiddle,
    cosmeticsRaw,
    cosmetics,
    itemSources,
    cosmeticSources,
  );
  validateAcquisitionSources(
    trackerData as unknown as AcquisitionSourceAssembly,
    acquisitionReferences,
  );
  console.log("  Acquisition source validation passed");

  stampVillagerVisibility(trackerData);
  stampStoreVisibility(trackerData);
  assignEntityVisibility(trackerData, cutsceneQuestMap, fiddle, questChainsRaw);

  const json = JSON.stringify(trackerData);
  const prettyJson = JSON.stringify(trackerData, null, 2);

  console.log("Step 5: Staging outputs...");
  const staged: StagedFile[] = [];

  staged.push({ content: prettyJson, path: resolve(OUTPUT_DIR, OUTPUT_FILE) });
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
  if (extractSpritesFlag) {
    console.log("\nStep 6: Extracting item sprites...");
    const spritesDir = resolve(SPRITES_OUTPUT_ROOT, version);
    const spriteResult = await extractSprites(resolve(assetsDir), trackerData.items, spritesDir);
    console.log(
      `  Extracted ${spriteResult.extracted} new, ${spriteResult.skipped} unchanged, ` +
        `${spriteResult.total} total`,
    );
    if (spriteResult.missing.length > 0) {
      console.error(`  ❌ ${spriteResult.missing.length} sprites not found:`);
      for (const name of spriteResult.missing) {
        console.error(`    - ${name}`);
      }
      console.error("  Aborting before publish: no tracked output file was written.");
      process.exit(1);
    }
    stagedSprites = spriteResult.staged;
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

function toRecord(keys: string[]): Record<string, true> {
  return Object.fromEntries(keys.map((k) => [k, true as const]));
}

void main();
