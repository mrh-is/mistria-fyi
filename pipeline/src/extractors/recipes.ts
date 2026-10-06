import { LOCALE_CODES } from "#lib/types/locale.js";

import { PipelineDiagnostics } from "../diagnostics.js";
import { buildQuestTypeIndex, forEachItem, forEachQuest } from "../extractor-helpers.js";
import { buildRequirementDefinitions, parseRequirements } from "../requirements.js";
import { resolveToVisibility } from "./visibility/requirement-resolver.js";

import type { Source as AcquisitionSource, SourceTuple } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type {
  FestivalId,
  ItemId,
  MinesBiomeId,
  MuseumWingId,
  PerkId,
  QuestId,
  QuestType,
  Recipe,
  RecipeId,
  Season,
  StoreId,
  TreasureChestTierId,
} from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

import type { TrackedQuestGroup } from "../extractor-helpers.js";
import type { ParsedGameData } from "../parse-fiddle.js";
import type { CutsceneQuestMap } from "./visibility/cutscene-quest-map.js";

const QUEST_TYPES_WITH_SCROLLS = [
  "fetch_quests",
  "stillwell_challenges",
  "story_quests",
  "tali_challenges",
] as const;

export interface RecipeNameSource {
  englishName: string;
  itemId: ItemId;
}

interface RawRecipeEntry {
  isDefault: boolean;
  itemId: string;
  name: string;
  recipeId: string;
}

interface StockVisibilityContext {
  cutsceneMap: CutsceneQuestMap;
  namedRequirements: ReturnType<typeof buildRequirementDefinitions>["namedRequirements"];
  primitivePredicates: ReturnType<typeof buildRequirementDefinitions>["primitivePredicates"];
}

export function deriveRecipeLocaleNames(
  sources: Record<RecipeId, RecipeNameSource>,
  itemLocaleNames: Record<LocaleCode, Record<ItemId, string>>,
): Record<LocaleCode, Record<RecipeId, string>> {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<RecipeId, string>
  >;
  for (const [recipeId, source] of Object.entries(sources) as [RecipeId, RecipeNameSource][]) {
    localeNames.en[recipeId] = source.englishName;
    for (const locale of LOCALE_CODES) {
      if (locale === "en") continue;
      const name = itemLocaleNames[locale][source.itemId];
      if (!name) {
        throw new Error(`Recipe "${recipeId}" has no "${locale}" item name for "${source.itemId}"`);
      }
      localeNames[locale][recipeId] = name;
    }
  }
  return localeNames;
}

export function extractRecipes(
  fiddle: ParsedGameData,
  cutsceneMap: CutsceneQuestMap = {},
  sharedDiagnostics?: PipelineDiagnostics,
): {
  recipeIdByItemId: Map<string, RecipeId>;
  recipeMemberItems: Map<RecipeId, ItemId[]>;
  recipeNameSources: Record<RecipeId, RecipeNameSource>;
  recipes: Record<RecipeId, Recipe>;
} {
  const diagnostics = sharedDiagnostics ?? new PipelineDiagnostics();
  const definitions = buildRequirementDefinitions(
    (fiddle.requirements as Record<string, unknown> | undefined) ?? {},
  );
  const stockVisibilityContext: StockVisibilityContext = { cutsceneMap, ...definitions };

  const entries = collectRecipeEntries(fiddle);
  const itemIdToRecipeId = new Map<string, string>();
  const grouped = new Map<string, RawRecipeEntry[]>();

  for (const entry of entries) {
    itemIdToRecipeId.set(entry.itemId, entry.recipeId);
    const group = grouped.get(entry.recipeId) ?? [];
    group.push(entry);
    grouped.set(entry.recipeId, group);
  }

  validateRecipeIdCollisions(itemIdToRecipeId, grouped, diagnostics);

  const knownRecipeIds = new Set(grouped.keys());
  const allSources = new Map<string, AcquisitionSource[]>();

  function mergeSources(incoming: Map<string, AcquisitionSource[]>): void {
    for (const [recipeId, sources] of incoming) {
      const existing = allSources.get(recipeId) ?? [];
      existing.push(...sources);
      allSources.set(recipeId, existing);
    }
  }

  mergeSources(collectQuestScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds, diagnostics));
  mergeSources(collectLetterScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds, diagnostics));
  mergeSources(
    collectStoreScrollSources(
      fiddle,
      itemIdToRecipeId,
      knownRecipeIds,
      stockVisibilityContext,
      diagnostics,
    ),
  );
  mergeSources(collectMuseumScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds, diagnostics));
  mergeSources(collectChickenStatueSources(fiddle, itemIdToRecipeId, knownRecipeIds, diagnostics));
  mergeSources(collectFishingChestSources(fiddle, itemIdToRecipeId, knownRecipeIds, diagnostics));
  mergeSources(collectWishingWellSources(fiddle, itemIdToRecipeId, knownRecipeIds, diagnostics));
  mergeSources(collectFestivalScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds, diagnostics));
  mergeSources(collectMinesRecipeSources(fiddle, itemIdToRecipeId));
  mergeSources(collectScrollBundleSources(fiddle, itemIdToRecipeId, stockVisibilityContext));
  mergeSources(collectPerkSources(fiddle, itemIdToRecipeId));
  mergeSources(collectDragonForgeSources(fiddle, itemIdToRecipeId));
  mergeSources(collectRenownRecipeSources(fiddle, itemIdToRecipeId));
  mergeSources(collectHardcodedSources(itemIdToRecipeId));

  const recipes: Record<RecipeId, Recipe> = {};
  const recipeNameSources = {} as Record<RecipeId, RecipeNameSource>;
  const recipeMemberItems = new Map<RecipeId, ItemId[]>();

  for (const [recipeId, group] of grouped) {
    const memberItemIds = group
      .map((e) => e.itemId as ItemId)
      .toSorted((a, b) => a.localeCompare(b));
    recipeMemberItems.set(recipeId as RecipeId, memberItemIds);

    const defaultFlags = group.map((e) => e.isDefault);
    const allDefault = defaultFlags.every(Boolean);
    const anyDefault = defaultFlags.some(Boolean);
    if (anyDefault && !allDefault) {
      diagnostics.add({
        fieldPath: `recipes.${recipeId}.recipe_is_default`,
        kind: "mixed-recipe-default",
        message: `recipe "${recipeId}" has mixed recipe_is_default flags`,
        targetId: recipeId,
      });
    }

    const nameSource = deriveRecipeNameSource(recipeId, group);
    const sources = deduplicateSources(allSources.get(recipeId) ?? []);
    const allSrc: AcquisitionSource[] = allDefault ? [{ type: "default" }, ...sources] : sources;

    const typedRecipeId = recipeId as RecipeId;
    recipeNameSources[typedRecipeId] = nameSource;
    recipes[typedRecipeId] = { sources: allSrc as SourceTuple };
  }

  const recipeIdByItemId = new Map<string, RecipeId>();
  for (const [itemId, rid] of itemIdToRecipeId) {
    recipeIdByItemId.set(itemId, rid as RecipeId);
  }

  const totalRecipes = Object.keys(recipes).length;
  const withSources = Object.values(recipes).filter((r) =>
    (r.sources ?? []).some((s) => s.type !== "default"),
  ).length;
  const withDefault = Object.values(recipes).filter((r) =>
    (r.sources ?? []).some((s) => s.type === "default"),
  ).length;
  const sourceTypeCounts = new Map<string, number>();
  for (const recipe of Object.values(recipes)) {
    const seenTypes = new Set((recipe.sources ?? []).map((s) => s.type));
    for (const t of seenTypes) {
      sourceTypeCounts.set(t, (sourceTypeCounts.get(t) ?? 0) + 1);
    }
  }
  const countParts = [...sourceTypeCounts.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${count} ${type}`);
  console.log(
    `  Recipes: ${totalRecipes} total, ${withDefault} default, ${withSources} with acquired sources (${countParts.join(", ")})`,
  );

  if (!sharedDiagnostics) diagnostics.validate();
  return { recipeIdByItemId, recipeMemberItems, recipeNameSources, recipes };
}

function buildQuestRecipeSource(
  nativeQuestGroup: TrackedQuestGroup,
  questType: QuestType,
  questId: string,
  quest: Record<string, unknown>,
  itemIdToRecipeId: Map<string, string>,
): AcquisitionSource {
  const sourceBase = {
    type: "quest" as const,
    questId: questId as QuestId,
    questType,
    trigger: "completion" as const,
  };

  if (nativeQuestGroup === "fetch_quests") {
    const itemId = extractQuestRequiredItem(quest);
    return itemId ? { ...sourceBase, requestedItemId: itemId as ItemId } : sourceBase;
  }
  if (nativeQuestGroup === "tali_challenges") {
    const itemId = extractQuestRequiredItem(quest);
    const challengeRecipeId = itemId ? itemIdToRecipeId.get(itemId) : undefined;
    return challengeRecipeId
      ? { ...sourceBase, challengeRecipeId: challengeRecipeId as RecipeId }
      : sourceBase;
  }
  return sourceBase;
}

function collectChickenStatueSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
  diagnostics: PipelineDiagnostics,
): Map<string, AcquisitionSource[]> {
  const chickenStatue = fiddle.chicken_statue as Record<string, unknown> | undefined;
  if (!chickenStatue) return new Map();

  const result = new Map<string, AcquisitionSource[]>();

  const common = chickenStatue.common as Record<string, unknown> | undefined;
  if (!common) return result;

  const misc = fiddle.misc as Record<string, Record<string, unknown>> | undefined;
  const chickenMisc = misc?.chicken_statue;
  const lowPrice = requireNumber(chickenMisc?.low_price, "misc.chicken_statue.low_price");
  const highPrice = requireNumber(chickenMisc?.high_price, "misc.chicken_statue.high_price");

  const rollCosts: [string, number][] = [
    ["small_roll", lowPrice],
    ["large_roll", highPrice],
  ];
  for (const [rollKey, cost] of rollCosts) {
    const roll = Array.isArray(common[rollKey]) ? (common[rollKey] as unknown[]) : [];
    for (const entry of roll) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;

      const scrollTarget =
        (obj.recipe_scroll as string | undefined) ?? (obj.crafting_scroll as string | undefined);
      if (!scrollTarget) continue;

      const recipeId = resolveScrollTarget(
        scrollTarget,
        itemIdToRecipeId,
        knownRecipeIds,
        "chicken_statue",
        diagnostics,
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ type: "chicken_statue", cost });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function collectDragonForgeSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, AcquisitionSource[]> {
  const result = new Map<string, AcquisitionSource[]>();

  forEachItem(fiddle, (itemId, item) => {
    if (item.recipe_is_default) return;

    const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];
    if (!tags.includes("blacksmithing")) return;
    if (!itemId.startsWith("dragon_forged_")) return;

    const recipeId = itemIdToRecipeId.get(itemId);
    if (recipeId && !result.has(recipeId)) {
      result.set(recipeId, [{ type: "default" }]);
    }
  });

  return result;
}

function collectFestivalScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
  diagnostics: PipelineDiagnostics,
): Map<string, AcquisitionSource[]> {
  const festivals = fiddle.festivals as Record<string, Record<string, unknown>> | undefined;
  if (!festivals) return new Map();

  const result = new Map<string, AcquisitionSource[]>();

  for (const [festivalId, festival] of Object.entries(festivals)) {
    if (festivalId === "default" || typeof festival !== "object" || festival === null) continue;

    const festivalObj = festival;
    const stocks = festivalObj.stocks as Record<string, unknown> | undefined;
    if (!stocks) continue;

    for (const [vendorStoreId, stockData] of Object.entries(stocks)) {
      if (vendorStoreId === "default") continue;
      if (!Array.isArray(stockData)) continue;

      for (const entry of stockData) {
        if (typeof entry !== "object" || entry === null) continue;
        const obj = entry as Record<string, unknown>;

        const scrollTarget =
          (obj.recipe_scroll as string | undefined) ?? (obj.crafting_scroll as string | undefined);
        if (!scrollTarget) continue;

        const recipeId = resolveScrollTarget(
          scrollTarget,
          itemIdToRecipeId,
          knownRecipeIds,
          `festivals/${festivalId}/${vendorStoreId}`,
          diagnostics,
        );
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({
          type: "festival",
          festivalId: festivalId as FestivalId,
          storeId: vendorStoreId as StoreId,
        });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}

function collectFishingChestSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
  diagnostics: PipelineDiagnostics,
): Map<string, AcquisitionSource[]> {
  const fishing = fiddle.fishing as Record<string, unknown> | undefined;
  if (!fishing) return new Map();

  const result = new Map<string, AcquisitionSource[]>();

  const chestTables = fishing.chest_tables as Record<string, unknown> | undefined;
  if (!chestTables) return result;

  for (const [chestTier, tierData] of Object.entries(chestTables)) {
    if (typeof tierData !== "object" || tierData === null) continue;
    const tierObj = tierData as Record<string, unknown>;
    const items = Array.isArray(tierObj.items) ? tierObj.items : [];

    for (const entry of items) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;

      if (obj.kind !== "recipe") continue;
      const scrollTarget = obj.value as string | undefined;
      if (!scrollTarget) continue;

      const recipeId = resolveScrollTarget(
        scrollTarget,
        itemIdToRecipeId,
        knownRecipeIds,
        `fishing/chest_tables/${chestTier}`,
        diagnostics,
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ type: "treasure_chest", tier: chestTier as TreasureChestTierId });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function collectHardcodedSources(
  itemIdToRecipeId: Map<string, string>,
): Map<string, AcquisitionSource[]> {
  const result = new Map<string, AcquisitionSource[]>();

  const hardcoded: [string, AcquisitionSource][] = [
    ["water_sprite_statue_v1", { type: "beach_cave_chest" }],
    ["stairs", { type: "upgrade", storeId: "carpenter" as StoreId, upgradeName: "House Stairs" }],
    [
      "farm_bridge",
      {
        type: "upgrade",
        storeId: "carpenter" as StoreId,
        upgradeName: "Starter Farm Bridge",
      },
    ],
    ["engagement_ring", { type: "engagement" }],
    ["kitchen_salt_and_pepper_shakers", { type: "default" }],
  ];

  for (const [itemId, source] of hardcoded) {
    const recipeId = itemIdToRecipeId.get(itemId);
    if (recipeId && !result.has(recipeId)) {
      result.set(recipeId, [source]);
    }
  }

  return result;
}

function collectLetterScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
  diagnostics: PipelineDiagnostics,
): Map<string, AcquisitionSource[]> {
  const letters = fiddle.letters as Record<string, Record<string, unknown>> | undefined;
  if (!letters) return new Map();

  const result = new Map<string, AcquisitionSource[]>();

  for (const [letterId, letter] of Object.entries(letters)) {
    if (letterId === "default" || typeof letter !== "object" || letter === null) continue;

    const letterObj = letter;
    const requirements = letterObj.requirements as Record<string, unknown> | undefined;
    const items = Array.isArray(letterObj.items) ? letterObj.items : [];

    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      const obj = item as Record<string, unknown>;

      const scrollTarget =
        (obj.recipe_scroll as string | undefined) ?? (obj.crafting_scroll as string | undefined);
      if (!scrollTarget) continue;

      const recipeId = resolveScrollTarget(
        scrollTarget,
        itemIdToRecipeId,
        knownRecipeIds,
        `letters/${letterId}`,
        diagnostics,
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];

      if (requirements) {
        if (typeof requirements.shipped_item === "string") {
          sources.push({
            type: "ship_item",
            triggerItemId: requirements.shipped_item as ItemId,
          });
          result.set(recipeId, sources);
          continue;
        }
        if (typeof requirements.donated_item === "string") {
          sources.push({
            type: "donate_item",
            triggerItemId: requirements.donated_item as ItemId,
          });
          result.set(recipeId, sources);
          continue;
        }
        if (requirements.reached_date !== undefined) {
          const dateVal = requirements.reached_date as Record<string, unknown> | string | undefined;
          let triggerDate: undefined | { day: number; season: Season; year?: number };
          if (typeof dateVal === "object" && dateVal !== null) {
            const day = dateVal.day as number | undefined;
            const season = dateVal.season as Season | undefined;
            const year = dateVal.year as number | undefined;
            if (day !== undefined && season !== undefined) {
              triggerDate =
                year !== undefined && year > 1 ? { day, season, year } : { day, season };
            }
          }
          if (triggerDate) {
            sources.push({ type: "reach_day", triggerDate });
          } else {
            diagnostics.add({
              fieldPath: `letters.${letterId}.requirements.reached_date`,
              kind: "unparseable-reached-date",
              message: `letter "${letterId}" has reached_date but couldn’t parse date`,
              targetId: letterId,
            });
          }
          result.set(recipeId, sources);
          continue;
        }
      }

      diagnostics.add({
        fieldPath: `letters.${letterId}.requirements`,
        kind: "letter-without-trigger",
        message: `letter "${letterId}" has recipe_scroll but no recognized requirement trigger`,
        targetId: letterId,
      });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function collectMinesRecipeSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, AcquisitionSource[]> {
  const dungeons = fiddle.dungeons as Record<string, Record<string, unknown>> | undefined;
  if (!dungeons) return new Map();

  const result = new Map<string, AcquisitionSource[]>();

  const dungeonsData = dungeons.dungeons as Record<string, unknown> | undefined;
  if (!dungeonsData) return result;

  const biomes = Array.isArray(dungeonsData.biomes) ? (dungeonsData.biomes as unknown[]) : [];

  for (let i = 0; i < biomes.length; i++) {
    const biome = biomes[i];
    if (typeof biome !== "object" || biome === null) continue;
    const biomeObj = biome as Record<string, unknown>;
    const biomeName = (biomeObj.name as string | undefined) ?? `Biome ${i + 1}`;
    const biomeId = biomeName
      .replace(/^The\s+/i, "")
      .toLowerCase()
      .replaceAll(/\s+/g, "_") as MinesBiomeId;

    const chestArrays: [string, PerkId][] = [["taste_maker", "taste_maker" as PerkId]];
    for (const [arrayKey, perkId] of chestArrays) {
      const items = Array.isArray(biomeObj[arrayKey]) ? (biomeObj[arrayKey] as unknown[]) : [];

      for (const itemId of items) {
        if (typeof itemId !== "string") continue;

        const recipeId = itemIdToRecipeId.get(itemId);
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({ type: "mines_chest", biomeId, perkId });
        result.set(recipeId, sources);
      }
    }

    const furniture = Array.isArray(biomeObj.furniture) ? (biomeObj.furniture as unknown[]) : [];
    for (const itemId of furniture) {
      if (typeof itemId !== "string") continue;

      const recipeId = itemIdToRecipeId.get(itemId);
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ type: "mines_dig_site", biomeId, perkId: "natural_beauty" as PerkId });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function collectMuseumScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
  diagnostics: PipelineDiagnostics,
): Map<string, AcquisitionSource[]> {
  const museumWings = fiddle.museum_wings as Record<string, Record<string, unknown>> | undefined;
  if (!museumWings) return new Map();

  const result = new Map<string, AcquisitionSource[]>();

  for (const [wingId, wing] of Object.entries(museumWings)) {
    if (wingId === "default" || typeof wing !== "object" || wing === null) continue;

    const wingObj = wing;
    const rewards = Array.isArray(wingObj.rewards) ? wingObj.rewards : [];
    for (let rewardIdx = 0; rewardIdx < rewards.length; rewardIdx++) {
      const reward = rewards[rewardIdx];
      if (typeof reward !== "object" || reward === null) continue;
      const rewardObj = reward as Record<string, unknown>;
      const setCount = rewardIdx + 1;
      const entries = Array.isArray(rewardObj.entries) ? rewardObj.entries : [];

      for (const entry of entries) {
        if (typeof entry !== "object" || entry === null) continue;
        const obj = entry as Record<string, unknown>;

        const scrollTarget =
          (obj.recipe_scroll as string | undefined) ?? (obj.crafting_scroll as string | undefined);
        if (!scrollTarget) continue;

        const recipeId = resolveScrollTarget(
          scrollTarget,
          itemIdToRecipeId,
          knownRecipeIds,
          `museum_wings/${wingId}`,
          diagnostics,
        );
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({ type: "museum_donation", setCount, wingId: wingId as MuseumWingId });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}

function collectPerkSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, AcquisitionSource[]> {
  const result = new Map<string, AcquisitionSource[]>();

  const perkBySubCategory: Record<string, string> = {
    faux_plant_set: "ornamental",
    void_set: "void_crafting",
  };

  const perkByItemId: Record<string, string> = {
    big_bell: "the_bell_tolls",
    essence_stone_giant: "magic_design",
    ocarina_sprite_statue: "the_bell_tolls",
    water_sprite_statue_large_v1: "big_water_sprites",
  };

  forEachItem(fiddle, (itemId, _item, _topCat, subCatKey) => {
    const perk = perkByItemId[itemId] ?? perkBySubCategory[subCatKey];
    if (!perk) return;

    const recipeId = itemIdToRecipeId.get(itemId);
    if (recipeId && !result.has(recipeId)) {
      result.set(recipeId, [{ type: "perk", perkId: perk as PerkId }]);
    }
  });

  return result;
}

function collectQuestScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
  diagnostics: PipelineDiagnostics,
): Map<string, AcquisitionSource[]> {
  const result = new Map<string, AcquisitionSource[]>();
  const questTypeIndex = buildQuestTypeIndex(fiddle);

  forEachQuest(fiddle, QUEST_TYPES_WITH_SCROLLS, (nativeQuestGroup, questId, quest) => {
    const questType = questTypeIndex.get(questId as QuestId);
    if (!questType) {
      throw new Error(`Unable to normalize quest type for "${questId}"`);
    }
    const rewards = Array.isArray(quest.rewards) ? quest.rewards : [];
    for (const reward of rewards) {
      if (typeof reward !== "object" || reward === null) continue;
      const obj = reward as Record<string, unknown>;

      const scrollTarget =
        (obj.recipe_scroll as string | undefined) ?? (obj.crafting_scroll as string | undefined);
      if (!scrollTarget) continue;

      const recipeId = resolveScrollTarget(
        scrollTarget,
        itemIdToRecipeId,
        knownRecipeIds,
        `${nativeQuestGroup}/${questId}`,
        diagnostics,
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push(
        buildQuestRecipeSource(
          nativeQuestGroup as TrackedQuestGroup,
          questType,
          questId,
          quest,
          itemIdToRecipeId,
        ),
      );
      result.set(recipeId, sources);
    }
  });

  return result;
}

function collectRecipeEntries(fiddle: ParsedGameData): RawRecipeEntry[] {
  const entries: RawRecipeEntry[] = [];

  forEachItem(fiddle, (itemId, item, _topCat, subCatKey) => {
    if (subCatKey === "unreviewed_new_items") return;

    const hasRecipe = Array.isArray(item.recipe) || typeof item.recipe_key === "string";
    const isDefault = item.recipe_is_default === true;

    if (!hasRecipe && isDefault) {
      console.log(
        `  Diagnostic: "${itemId}" has recipe_is_default but no recipe array or recipe_key — skipped`,
      );
      return;
    }

    if (!hasRecipe) return;

    const recipeKey = item.recipe_key as string | undefined;
    const recipeId = recipeKey ?? itemId;
    const name = (item.name as string | undefined) ?? itemId;

    entries.push({ isDefault, itemId, name, recipeId });
  });

  return entries;
}

function collectRenownRecipeSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, AcquisitionSource[]> {
  const renown = fiddle.renown as Record<string, unknown> | undefined;
  if (!renown) return new Map();

  const result = new Map<string, AcquisitionSource[]>();
  const rewards = Array.isArray(renown.rewards) ? renown.rewards : [];

  for (let i = 0; i < rewards.length; i++) {
    const reward = rewards[i];
    if (typeof reward !== "object" || reward === null) continue;
    const itemId = (reward as Record<string, unknown>).item as string | undefined;
    if (!itemId) continue;

    const recipeId = itemIdToRecipeId.get(itemId);
    if (!recipeId || result.has(recipeId)) continue;

    result.set(recipeId, [{ type: "renown", level: i + 1 }]);
  }

  return result;
}

function collectScrollBundleSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  ctx: StockVisibilityContext,
): Map<string, AcquisitionSource[]> {
  const result = new Map<string, AcquisitionSource[]>();

  const bundleIdToSetTag = new Map<string, string>();
  const bundleIdToName = new Map<string, string>();
  forEachItem(fiddle, (itemId, item) => {
    const setUnlock = item.set_unlock as string | undefined;
    if (setUnlock) {
      bundleIdToSetTag.set(itemId, setUnlock);
      bundleIdToName.set(itemId, (item.name as string | undefined) ?? itemId);
    }
  });

  if (bundleIdToSetTag.size === 0) return result;

  const setTagToStore = new Map<
    string,
    { bundleName: string; storeId: string; visibility: VisibilityCondition }
  >();
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (stores) {
    for (const [storeId, store] of Object.entries(stores)) {
      if (storeId === "default" || typeof store !== "object" || store === null) continue;
      const categories = Array.isArray(store.categories) ? store.categories : [];

      for (const category of categories) {
        if (typeof category !== "object" || category === null) continue;
        const cat = category as Record<string, unknown>;

        const allStock: unknown[] = [];
        if (Array.isArray(cat.constant_stock)) {
          allStock.push(...(cat.constant_stock as unknown[]));
        }
        if (Array.isArray(cat.random_stock)) {
          allStock.push(...(cat.random_stock as unknown[]));
        }
        const seasonal = cat.seasonal as Record<string, unknown> | undefined;
        if (seasonal) {
          for (const val of Object.values(seasonal)) {
            if (Array.isArray(val)) allStock.push(...(val as unknown[]));
          }
        }

        for (const entry of allStock) {
          let itemId: string | undefined;
          if (typeof entry === "string") {
            itemId = entry;
          } else if (typeof entry === "object" && entry !== null) {
            itemId = (entry as Record<string, unknown>).item as string | undefined;
          }
          if (!itemId) continue;
          const setTag = bundleIdToSetTag.get(itemId);
          if (setTag) {
            const bundleName = bundleIdToName.get(itemId) ?? itemId;
            const entryObject =
              typeof entry === "object" && entry !== null
                ? (entry as Record<string, unknown>)
                : undefined;
            const visibility = resolveStockVisibility(
              entryObject?.requirements,
              `${storeId}/${itemId}`,
              ctx,
            );
            setTagToStore.set(setTag, { bundleName, storeId, visibility });
          }
        }
      }
    }
  }

  forEachItem(fiddle, (itemId, item) => {
    const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];

    for (const [setTag, info] of setTagToStore) {
      if (tags.includes(setTag)) {
        const recipeId = itemIdToRecipeId.get(itemId);
        if (recipeId && !result.has(recipeId)) {
          result.set(recipeId, [
            {
              type: "scroll_bundle",
              bundleName: info.bundleName,
              storeId: info.storeId as StoreId,
              ...(info.visibility.type === "always" ? {} : { visibility: info.visibility }),
            },
          ]);
        }
      }
    }
  });

  return result;
}

function collectStoreScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
  ctx: StockVisibilityContext,
  diagnostics: PipelineDiagnostics,
): Map<string, AcquisitionSource[]> {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return new Map();

  const result = new Map<string, AcquisitionSource[]>();

  for (const [storeId, store] of Object.entries(stores)) {
    if (storeId === "default" || typeof store !== "object" || store === null) continue;
    const storeObj = store;
    const categories = Array.isArray(storeObj.categories) ? storeObj.categories : [];

    for (const category of categories) {
      if (typeof category !== "object" || category === null) continue;
      const cat = category as Record<string, unknown>;

      const stockArrays: unknown[][] = [];

      if (Array.isArray(cat.constant_stock)) stockArrays.push(cat.constant_stock);

      const seasonal = cat.seasonal as Record<string, unknown> | undefined;
      if (seasonal) {
        for (const val of Object.values(seasonal)) {
          if (Array.isArray(val)) stockArrays.push(val);
        }
      }

      if (Array.isArray(cat.random_stock)) stockArrays.push(cat.random_stock);

      for (const arr of stockArrays) {
        for (const entry of arr) {
          if (typeof entry !== "object" || entry === null) continue;
          const obj = entry as Record<string, unknown>;

          const scrollTarget =
            (obj.recipe_scroll as string | undefined) ??
            (obj.crafting_scroll as string | undefined);

          let recipeId: string | undefined;
          if (scrollTarget) {
            recipeId = resolveScrollTarget(
              scrollTarget,
              itemIdToRecipeId,
              knownRecipeIds,
              `stores/${storeId}`,
              diagnostics,
            );
          } else if (obj.include_recipe === true) {
            recipeId = itemIdToRecipeId.get(obj.item as string);
          }

          if (!recipeId) continue;

          const sources = result.get(recipeId) ?? [];
          const visibility = resolveStockVisibility(
            obj.requirements,
            `${storeId}/${recipeId}`,
            ctx,
          );

          // NOTE: perk-gated stock (has_perk requirement) and repaired-store upgrade gates
          // (UPGRADE_PREDICATES) both collapse to a plain "store" source. AcquisitionSource has
          // no equivalent of the legacy `store_with_perk` type or `upgraded` flag; Task 2 will
          // reintroduce richer availability/restriction modeling.
          sources.push({
            type: "store",
            storeId: storeId as StoreId,
            ...(visibility.type === "always" ? {} : { visibility }),
          });
          result.set(recipeId, sources);
        }
      }
    }
  }

  return result;
}

function collectWishingWellSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
  diagnostics: PipelineDiagnostics,
): Map<string, AcquisitionSource[]> {
  const wishingWell = fiddle.wishing_well as Record<string, unknown> | undefined;
  if (!wishingWell) return new Map();

  const result = new Map<string, AcquisitionSource[]>();

  const common = wishingWell.common as Record<string, unknown> | undefined;
  if (!common) return result;

  const misc = fiddle.misc as Record<string, Record<string, unknown>> | undefined;
  const wellMisc = misc?.wishing_well;
  const lowPrice = requireNumber(wellMisc?.low_price, "misc.wishing_well.low_price");
  const highPrice = requireNumber(wellMisc?.high_price, "misc.wishing_well.high_price");

  const rollCosts: [string, number][] = [
    ["small_roll", lowPrice],
    ["large_roll", highPrice],
  ];
  for (const [rollKey, cost] of rollCosts) {
    const roll = Array.isArray(common[rollKey]) ? (common[rollKey] as unknown[]) : [];
    for (const entry of roll) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;

      const scrollTarget =
        (obj.recipe_scroll as string | undefined) ?? (obj.crafting_scroll as string | undefined);
      if (!scrollTarget) continue;

      const recipeId = resolveScrollTarget(
        scrollTarget,
        itemIdToRecipeId,
        knownRecipeIds,
        "wishing_well",
        diagnostics,
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ type: "wishing_well", cost });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function compareRecipeSources(a: AcquisitionSource, b: AcquisitionSource): number {
  const cmp = a.type.localeCompare(b.type);
  if (cmp !== 0) return cmp;
  return sourceKey(a).localeCompare(sourceKey(b));
}

function deduplicateSources(sources: AcquisitionSource[]): AcquisitionSource[] {
  const seen = new Set<string>();
  const result: AcquisitionSource[] = [];
  const sorted = [...sources].toSorted(compareRecipeSources);
  for (const s of sorted) {
    const key = sourceKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(s);
  }
  return result;
}

function deriveRecipeNameSource(recipeId: string, group: RawRecipeEntry[]): RecipeNameSource {
  const uniqueNames = [...new Set(group.map((e) => e.name))].toSorted();
  if (uniqueNames.length === 1) {
    return {
      englishName: uniqueNames[0],
      itemId: group.map(({ itemId }) => itemId).toSorted()[0] as ItemId,
    };
  }

  if (uniqueNames.length === 2) {
    const plainBed = uniqueNames.find(
      (name) =>
        name.endsWith(" Single Bed") || (name.endsWith(" Bed") && !name.endsWith(" Double Bed")),
    );
    const doubleBed = uniqueNames.find((n) => n.endsWith(" Double Bed"));
    if (plainBed && doubleBed) {
      const prefix = doubleBed.slice(0, -" Double Bed".length);
      const representative = group
        .filter(({ name }) => name === plainBed)
        .map(({ itemId }) => itemId)
        .toSorted()[0];
      return { englishName: `${prefix} Bed`, itemId: representative as ItemId };
    }
  }

  throw new Error(
    `Recipe "${recipeId}" has ${uniqueNames.length} distinct presentation names: ${uniqueNames.join(", ")}`,
  );
}

function extractQuestRequiredItem(quest: Record<string, unknown>): string | undefined {
  const stages = Array.isArray(quest.stages) ? quest.stages : [];
  for (const stage of stages) {
    if (typeof stage !== "object" || stage === null) continue;
    const requirements = (stage as Record<string, unknown>).requirements;
    if (typeof requirements !== "object" || requirements === null) continue;
    const itemId = firstRequiredItem((requirements as Record<string, unknown>).has_item);
    if (itemId) return itemId;
  }
  return undefined;
}

function firstRequiredItem(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const itemId = firstRequiredItem(entry);
      if (itemId) return itemId;
    }
    return undefined;
  }
  if (typeof value === "object" && value !== null) {
    return Object.keys(value)[0];
  }
  return undefined;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Invalid or missing numeric value "${path}"`);
  }
  return value;
}

function resolveScrollTarget(
  scrollTarget: string,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
  context: string,
  diagnostics: PipelineDiagnostics,
): string | undefined {
  const recipeId = itemIdToRecipeId.get(scrollTarget);
  if (recipeId) return recipeId;
  if (knownRecipeIds.has(scrollTarget)) return scrollTarget;
  diagnostics.add({
    fieldPath: context,
    kind: "unresolved-scroll-target",
    message: `scroll target "${scrollTarget}" in ${context} has no matching item`,
    targetId: scrollTarget,
  });
  return undefined;
}

function resolveStockVisibility(
  requirements: unknown,
  entityId: string,
  ctx: StockVisibilityContext,
): VisibilityCondition {
  const expression = parseRequirements(
    requirements,
    ctx.namedRequirements,
    ctx.primitivePredicates,
    { entityId, fieldPath: "requirements", sourcePath: "fiddle/stores.toml" },
  );
  return resolveToVisibility(expression, ctx.cutsceneMap);
}

function sourceKey(s: AcquisitionSource): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(s).toSorted(([a], [b]) => a.localeCompare(b))),
  );
}

function validateRecipeIdCollisions(
  itemIdToRecipeId: Map<string, string>,
  grouped: Map<string, RawRecipeEntry[]>,
  diagnostics: PipelineDiagnostics,
): void {
  for (const [itemId, recipeId] of itemIdToRecipeId) {
    if (itemId === recipeId) continue;
    if (grouped.has(itemId) && itemId !== recipeId) {
      diagnostics.add({
        fieldPath: `recipes.${itemId}`,
        kind: "recipe-id-collision",
        message: `item ID "${itemId}" is also a recipe key for a different group`,
        targetId: itemId,
      });
    }
  }
}
