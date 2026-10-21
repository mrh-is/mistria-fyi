import { getDotPath, safeParse } from "valibot";

import { TrackerDataSchema } from "#lib/types/tracker-data-schema.js";
/**
 * Assembles `tracker-data.json` and its locale chunks from an evaluated fiddle. Reads no files and
 * writes none: localization arrives through an injected {@link Localizer}, and `main.ts` owns
 * argument parsing, staging, & publishing.
 */
import { isNonEmptyArray, recordEntries, recordMap } from "#lib/utils/record.js";

import { collectExplorationSources } from "./acquisition/collectors/exploration.js";
import { collectNaturalSources } from "./acquisition/collectors/natural.js";
import { collectRecipeOnlySources } from "./acquisition/collectors/recipe-only.js";
import { collectRewardSources } from "./acquisition/collectors/rewards.js";
import { collectStoreSources } from "./acquisition/collectors/stores.js";
import { getExcludedCosmeticIds } from "./acquisition/exclusions.js";
import { collectNativeReferenceRegistries } from "./acquisition/native-references.js";
import { assertNoStockGates } from "./acquisition/pipeline-source.js";
import { deriveRecipeProductSources } from "./acquisition/recipe-products.js";
import { AcquisitionReferenceIndex } from "./acquisition/reference-index.js";
import { finalizeSources, requireSources } from "./acquisition/required-sources.js";
import {
  applyReviewedOverrides,
  collectDefaultCosmeticSources,
  collectDefaultItemSources,
  getReviewedOverrides,
} from "./acquisition/reviewed-overrides.js";
import { REVIEWED_NON_NATIVE_REFERENCES } from "./acquisition/reviewed-references.js";
import {
  AnimalCosmeticSourceAccumulator,
  CosmeticSourceAccumulator,
  ItemSourceAccumulator,
  PetCosmeticSourceAccumulator,
  RecipeSourceAccumulator,
} from "./acquisition/source-accumulator.js";
import { validateAcquisitionSources } from "./acquisition/validate-sources.js";
import { PipelineDiagnostics } from "./diagnostics.js";
import {
  assignEntityVisibility,
  extractCategoryVisibility,
  extractHeartLevelChanges,
  stampStoreVisibility,
  stampVillagerVisibility,
} from "./enrich/entity-visibility.js";
import { extractAlmanac, readAlmanacCategories } from "./extract/almanac.js";
import { extractAnimals } from "./extract/animals.js";
import { extractCosmetics } from "./extract/cosmetics.js";
import { buildCutsceneQuestMap } from "./extract/cutscene-quest-map.js";
import { extractDates } from "./extract/dates.js";
import { extractFestivals } from "./extract/festivals.js";
import { extractLocationNames } from "./extract/locations.js";
import { extractMines } from "./extract/mines.js";
import { extractMount } from "./extract/mount.js";
import { extractMuseum } from "./extract/museum.js";
import { extractPetCosmetics, extractPetSkins } from "./extract/pets.js";
import { extractQuestChains } from "./extract/quest-chains.js";
import { extractQuests } from "./extract/quests.js";
import { extractRecipeScrollUnlocks } from "./extract/recipe-scrolls.js";
import { deriveRecipeLocaleNames, extractRecipes } from "./extract/recipes.js";
import { extractTownRanks } from "./extract/renown.js";
import { extractSkills } from "./extract/skills.js";
import { extractStoresMeta } from "./extract/stores-meta.js";
import { extractTreasureChestTiers } from "./extract/treasure-chest-tiers.js";
import { extractVillagers } from "./extract/villagers.js";
import { forEachItem } from "./extractor-helpers.js";
import { APP_UI_STRINGS, extractUiStrings, tierKeys } from "./localize/ui-strings.js";
import {
  validateCosmeticExclusionSources,
  validateItemExclusionSources,
} from "./overrides/exclusions.js";
import { isPregnancyQuest } from "./overrides/game-facts.js";
import { createRequirementContext } from "./parse/requirements.js";
import { REVIEWED_PIPELINE_DIAGNOSTICS } from "./reviewed-diagnostics.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { Item, ItemId, QuestId, TrackerData, VillagerId } from "#lib/types/tracker-data.js";

import type { ReviewedOverrides } from "./acquisition/reviewed-overrides.js";
import type { ReviewedPipelineDiagnostic } from "./diagnostics.js";
import type { ItemIconSpriteIndex } from "./extract/almanac.js";
import type { VillagerIconSpriteIndex } from "./extract/villagers.js";
import type { Localizer } from "./localize/localize.js";
import type { ParsedGameData } from "./parse/parse-fiddle.js";

export interface AssembleOptions {
  /** Exact diagnostics this run may raise. Defaults to the installed game's reviewed list. */
  reviewedDiagnostics?: readonly ReviewedPipelineDiagnostic[];
  /** Hand-reviewed acquisition sources. Defaults to the installed game's reviewed overrides. */
  reviewedOverrides?: ReviewedOverrides;
  version: string;
}

/** One `src/lib/data/locales/<tag>/<category>.json` chunk, for every locale. */
export interface LocaleChunk {
  byLocale: Record<LocaleCode, Record<string, string>>;
  category: string;
}

export interface AssembledTrackerData {
  /** Inputs for the optional sprite-extraction step. */
  iconSpritesByItemId: ItemIconSpriteIndex;
  iconSpritesByVillagerId: VillagerIconSpriteIndex;
  /** Locale chunks in their staging order. */
  localeChunks: readonly LocaleChunk[];
  trackerData: TrackerData;
}

/**
 * Extracts every entity kind, attaches acquisition sources, assigns visibility, and validates the
 * result. Expects a fiddle whose expressions {@link evaluateExpressions} has already resolved.
 * Throws when diagnostics or acquisition-source validation fail, so callers never stage invalid
 * output.
 */
export function assembleTrackerData(
  fiddle: ParsedGameData,
  localizer: Localizer,
  options: AssembleOptions,
): AssembledTrackerData {
  const diagnostics = new PipelineDiagnostics(
    options.reviewedDiagnostics ?? REVIEWED_PIPELINE_DIAGNOSTICS,
  );

  console.log("Step 3: Extracting tracker data...");
  const { localeNames: museumLocaleNames, museum } = extractMuseum(fiddle, localizer);
  const cutsceneQuestMap = buildCutsceneQuestMap(fiddle);
  const recipeSources = new RecipeSourceAccumulator();
  const {
    recipeIdByItemId,
    recipeMemberItems,
    recipeNameSources,
    recipes: recipeDrafts,
  } = extractRecipes(fiddle, cutsceneQuestMap, diagnostics, recipeSources);
  const {
    almanac,
    iconSpritesByItemId,
    items: itemMetadata,
    localeNames: itemLocaleNames,
  } = extractAlmanac(fiddle, localizer, diagnostics);
  const recipeLocaleNames = deriveRecipeLocaleNames(recipeNameSources, itemLocaleNames);
  const { animals: animalDrafts, localeNames: animalLocaleNames } = extractAnimals(
    fiddle,
    localizer,
  );
  const { cosmetics: petCosmeticDrafts, localeNames: petCosmeticLocaleNames } = extractPetCosmetics(
    fiddle,
    localizer,
  );
  const { localeNames: petSkinLocaleNames, skins: petSkinDrafts } = extractPetSkins(
    fiddle,
    itemLocaleNames,
  );
  const {
    iconSpritesByVillagerId,
    localeNames: villagerLocaleNames,
    villagers,
  } = extractVillagers(fiddle, localizer);
  const {
    cosmetics: cosmeticDrafts,
    cosmeticSlots,
    localeNames: cosmeticLocaleNames,
    subCategoryLocaleNames: cosmeticSubCategoryLocaleNames,
  } = extractCosmetics(fiddle, localizer);
  const {
    localeNames: skillLocaleNames,
    perkLocaleNames,
    perkTierLevels,
    skills,
  } = extractSkills(fiddle, localizer);
  const { localeNames: townRankLocaleNames, townRanks } = extractTownRanks(fiddle, localizer);
  const { localeNames: questLocaleNames, quests } = extractQuests(
    fiddle,
    localizer,
    recipeIdByItemId,
  );
  const {
    biomeLocaleNames: mineLocaleNames,
    mines,
    spellLocaleNames,
  } = extractMines(fiddle, localizer);
  const { localeNames: storeLocaleNames, stores: storesMeta } = extractStoresMeta(
    fiddle,
    localizer,
  );
  const { dates, localeNames: dateLocaleNames } = extractDates(fiddle, localizer);
  const { festivals, localeNames: festivalLocaleNames } = extractFestivals(fiddle, localizer);
  const { localeNames: treasureChestTierLocaleNames, tiers: treasureChestTiers } =
    extractTreasureChestTiers(fiddle, localizer);
  const maxVariantTiers = Math.max(
    0,
    ...Object.values(animalDrafts).map((animal) => animal.variantTiers.length),
  );
  const { localeNames: uiLocaleNames } = extractUiStrings(fiddle, localizer, [
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
  const { localeNames: mountLocaleNames, mount } = extractMount(
    fiddle,
    localizer,
    requirementContext,
  );

  const itemSources = new ItemSourceAccumulator();
  const cosmeticSources = new CosmeticSourceAccumulator();
  const animalCosmeticSources = new AnimalCosmeticSourceAccumulator();
  const petCosmeticSources = new PetCosmeticSourceAccumulator();
  const recipeContext = {
    diagnostics,
    knownRecipeIds: new Set(Object.keys(recipeDrafts)),
    recipeIdByItemId,
    sources: recipeSources,
  };
  deriveRecipeProductSources(fiddle, recipeMemberItems, itemSources);
  collectNaturalSources(fiddle, itemSources, cosmeticSources, petCosmeticSources, diagnostics);
  collectRewardSources(
    fiddle,
    itemSources,
    cosmeticSources,
    animalCosmeticSources,
    petCosmeticSources,
    recipeContext,
    requirementContext,
  );
  collectStoreSources(
    fiddle,
    requirementContext,
    itemSources,
    cosmeticSources,
    animalCosmeticSources,
    recipeContext,
  );
  collectExplorationSources(fiddle, itemSources, cosmeticSources, recipeContext);
  collectRecipeOnlySources(fiddle, recipeContext);
  for (const recipeId of Object.keys(recipeDrafts) as (keyof typeof recipeDrafts)[]) {
    recipeDrafts[recipeId].sources = recipeSources.get(recipeId);
  }
  collectDefaultItemSources(fiddle, itemSources, itemMetadata);
  collectDefaultCosmeticSources(cosmeticDrafts, cosmeticSources);

  validateCosmeticExclusionSources(fiddle, cosmeticSources);
  validateItemExclusionSources(itemSources);

  const overrideDiagnostics = applyReviewedOverrides(
    itemMetadata,
    cosmeticDrafts,
    itemSources,
    cosmeticSources,
    options.reviewedOverrides ?? getReviewedOverrides(fiddle),
  );
  for (const diagnostic of overrideDiagnostics) {
    diagnostics.add({ ...diagnostic, fieldPath: `${diagnostic.namespace}.${diagnostic.targetId}` });
  }

  // Attach inline acquisition sources to cosmetics
  for (const [cosmeticId, sources] of cosmeticSources.entries()) {
    const cosmetic = cosmeticDrafts[cosmeticId];
    if (cosmetic && isNonEmptyArray(sources)) {
      cosmetic.sources = sources;
    }
  }

  // Attach sources to animal cosmetics
  for (const { animalId, cosmeticId, sources } of animalCosmeticSources.animalCosmeticEntries()) {
    const cosmetic = animalDrafts[animalId]?.cosmetics[cosmeticId];
    if (!cosmetic) continue;
    cosmetic.sources = [...cosmetic.sources, ...sources];
  }

  // Attach sources to pet cosmetic sets
  for (const [setId, sources] of petCosmeticSources.entries()) {
    const set = petCosmeticDrafts[setId];
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
  for (const [skinId, skin] of Object.entries(petSkinDrafts)) {
    const itemId = petSkinItemMap.get(skinId);
    if (itemId) {
      const itemSrc = itemSources.get(itemId as ItemId);
      if (isNonEmptyArray(itemSrc)) {
        skin.sources = itemSrc;
      }
    }
  }

  // Every kind below promises a non-empty `SourceTuple`, so finalizing throws on the first entity
  // that has no sources rather than emitting an empty list under that type.
  const scrollUnlocks = extractRecipeScrollUnlocks(fiddle, recipeIdByItemId);
  const items: Record<ItemId, Item> = recordMap(itemMetadata, ({ category }, itemId) => ({
    category,
    ...(scrollUnlocks[itemId as ItemId] ? { recipeUnlocks: scrollUnlocks[itemId as ItemId] } : {}),
    sources: requireSources(`items.${itemId}`, itemSources.get(itemId as ItemId)),
  }));
  const cosmetics = finalizeSources("cosmetics", cosmeticDrafts);
  const recipes = finalizeSources("recipes", recipeDrafts);
  const animals = recordMap(animalDrafts, (animal, animalId) => ({
    ...animal,
    cosmetics: finalizeSources(`animals.${animalId}.cosmetics`, animal.cosmetics),
  }));
  const petCosmetics = finalizeSources("pets.cosmetics", petCosmeticDrafts);
  const petSkins = finalizeSources("pets.skins", petSkinDrafts);

  const totalAnimalCosmetics = Object.values(animals).reduce(
    (n, a) => n + Object.keys(a.cosmetics).length,
    0,
  );
  console.log(
    `  Inline sources: ${Object.keys(items).length} items, ` +
      `${Object.keys(cosmetics).length} cosmetics, ` +
      `${Object.keys(recipes).length} recipes, ` +
      `${totalAnimalCosmetics} animal cosmetics, ` +
      `${Object.keys(petCosmetics).length} pet cosmetics, ` +
      `${Object.keys(petSkins).length} pet skins`,
  );

  console.log();

  console.log("Step 3b: Extracting visibility data...");
  const questChainsRaw = extractQuestChains(fiddle);
  const heartLevelChangesData = extractHeartLevelChanges(fiddle, cutsceneQuestMap);
  const categoryVisibilityData = extractCategoryVisibility();

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
    if (isPregnancyQuest(questId)) {
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
    items,
    mines,
    mount,
    museum,
    perkTierLevels,
    pets: { cosmetics: petCosmetics, skins: petSkins },
    pregnancyQuestByVillager,
    questOrder: {
      cooking: questChainsRaw.cooking,
      crown: questChainsRaw.crown,
      mission: questChainsRaw.mission,
    },
    quests,
    recipes,
    skills,
    stores: storesMeta,
    townRanks,
    treasureChestTiers,
    version: options.version,
    villagers,
  };

  stampVillagerVisibility(trackerData);
  stampStoreVisibility(trackerData);
  assignEntityVisibility(trackerData, cutsceneQuestMap, fiddle, questChainsRaw);

  // Validation is the last step before serialization: visibility assignment rewrites sources and
  // injects hard-coded quest gates, so validating any earlier would miss the emitted shape.
  diagnostics.validate();
  assertNoStockGates(trackerData);
  validateAcquisitionSources(trackerData, buildAcquisitionReferences(trackerData, fiddle));
  const validation = safeParse(TrackerDataSchema, trackerData);
  if (!validation.success) {
    throw new Error(
      `Tracker data schema validation failed:\n${validation.issues
        .map((issue) => `${getDotPath(issue) ?? "<root>"}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  console.log("  Tracker data validation passed");

  return {
    iconSpritesByItemId,
    iconSpritesByVillagerId,
    localeChunks: [
      { byLocale: villagerLocaleNames, category: "villagers" },
      { byLocale: dateLocaleNames, category: "dates" },
      { byLocale: festivalLocaleNames, category: "festivals" },
      { byLocale: museumLocaleNames, category: "museum_wings" },
      { byLocale: perkLocaleNames, category: "perks" },
      { byLocale: petCosmeticLocaleNames, category: "pets/cosmetic_sets" },
      { byLocale: questLocaleNames, category: "quests" },
      { byLocale: skillLocaleNames, category: "skills" },
      { byLocale: spellLocaleNames, category: "spells" },
      { byLocale: storeLocaleNames, category: "stores" },
      { byLocale: animalLocaleNames, category: "animals" },
      { byLocale: cosmeticLocaleNames, category: "cosmetics" },
      { byLocale: cosmeticSubCategoryLocaleNames, category: "cosmetics/subcategories" },
      { byLocale: uiLocaleNames, category: "ui" },
      { byLocale: mineLocaleNames, category: "mines" },
      { byLocale: mountLocaleNames, category: "mount" },
      { byLocale: townRankLocaleNames, category: "town-ranks" },
      { byLocale: itemLocaleNames, category: "items" },
      { byLocale: recipeLocaleNames, category: "recipes" },
      { byLocale: petSkinLocaleNames, category: "pets/skins" },
      { byLocale: treasureChestTierLocaleNames, category: "treasure-chest-tiers" },
      { byLocale: extractLocationNames(fiddle, localizer), category: "locations" },
    ],
    trackerData,
  };
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
      cosmetics: getExcludedCosmeticIds(fiddle),
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
