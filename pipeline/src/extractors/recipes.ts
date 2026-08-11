import type {
  ItemId,
  QuestId,
  Recipe,
  RecipeId,
  RecipePresentation,
  RecipeSource,
  WingId,
} from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

const QUEST_TYPES_WITH_SCROLLS = [
  "fetch_quests",
  "stillwell_challenges",
  "story_quests",
  "tali_challenges",
];

interface RawRecipeEntry {
  defaultUnlocked: boolean;
  itemId: string;
  name: string;
  recipeId: string;
}

export function extractRecipes(fiddle: ParsedGameData): {
  recipeIdByItemId: Map<string, RecipeId>;
  recipes: Record<RecipeId, Recipe>;
} {
  const entries = collectRecipeEntries(fiddle);
  const itemIdToRecipeId = new Map<string, string>();
  const grouped = new Map<string, RawRecipeEntry[]>();

  for (const entry of entries) {
    itemIdToRecipeId.set(entry.itemId, entry.recipeId);
    const group = grouped.get(entry.recipeId) ?? [];
    group.push(entry);
    grouped.set(entry.recipeId, group);
  }

  validateRecipeIdCollisions(itemIdToRecipeId, grouped);

  const knownRecipeIds = new Set(grouped.keys());
  const allSources = new Map<string, RecipeSource[]>();

  function mergeSources(incoming: Map<string, RecipeSource[]>): void {
    for (const [recipeId, sources] of incoming) {
      const existing = allSources.get(recipeId) ?? [];
      existing.push(...sources);
      allSources.set(recipeId, existing);
    }
  }

  mergeSources(collectQuestScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectLetterScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectStoreScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectMuseumScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectChickenStatueSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectFishingChestSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectWishingWellSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectFestivalScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectDungeonDelicacySources(fiddle, itemIdToRecipeId));
  mergeSources(collectScrollBundleSources(fiddle, itemIdToRecipeId));
  mergeSources(collectBiomeFurnitureSources(fiddle, itemIdToRecipeId));
  mergeSources(collectPerkSources(fiddle, itemIdToRecipeId));
  mergeSources(collectDragonForgeSources(fiddle, itemIdToRecipeId));
  mergeSources(collectRenownRecipeSources(fiddle, itemIdToRecipeId));
  mergeSources(collectHardcodedSources(itemIdToRecipeId));

  const recipes: Record<RecipeId, Recipe> = {};

  for (const [recipeId, group] of grouped) {
    const memberItemIds = group.map((e) => e.itemId as ItemId).sort((a, b) => a.localeCompare(b));

    const defaultFlags = group.map((e) => e.defaultUnlocked);
    const allDefault = defaultFlags.every(Boolean);
    const anyDefault = defaultFlags.some(Boolean);
    if (anyDefault && !allDefault) {
      console.warn(
        `  Warning: recipe "${recipeId}" has mixed recipe_is_default flags — treating as not default`,
      );
    }

    const presentations = buildPresentations(group);
    const sources = deduplicateSources(allSources.get(recipeId) ?? []);

    recipes[recipeId as RecipeId] = {
      defaultUnlocked: allDefault,
      memberItemIds,
      presentations,
      sources,
    };
  }

  const recipeIdByItemId = new Map<string, RecipeId>();
  for (const [itemId, rid] of itemIdToRecipeId) {
    recipeIdByItemId.set(itemId, rid as RecipeId);
  }

  const totalRecipes = Object.keys(recipes).length;
  const withSources = Object.values(recipes).filter((r) => r.sources.length > 0).length;
  const withDefault = Object.values(recipes).filter((r) => r.defaultUnlocked).length;
  const sourceTypeCounts = new Map<string, number>();
  for (const recipe of Object.values(recipes)) {
    const seenTypes = new Set(recipe.sources.map((s) => s.type));
    for (const t of seenTypes) {
      sourceTypeCounts.set(t, (sourceTypeCounts.get(t) ?? 0) + 1);
    }
  }
  const countParts = [...sourceTypeCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${count} ${type}`);
  console.log(
    `  Recipes: ${totalRecipes} total, ${withDefault} default, ${withSources} with acquired sources (${countParts.join(", ")})`,
  );

  return { recipeIdByItemId, recipes };
}

function collectHardcodedSources(
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const result = new Map<string, RecipeSource[]>();

  const hardcoded: [string, RecipeSource][] = [
    ["water_sprite_statue_v1", { type: "treasure_chest" }],
    ["stairs", { storeId: "carpenter", type: "store" }],
    ["farm_bridge", { storeId: "carpenter", type: "store" }],
    ["engagement_ring", { cutscene: "ten_hearts", type: "cutscene" }],
  ];

  for (const [itemId, source] of hardcoded) {
    const recipeId = itemIdToRecipeId.get(itemId);
    if (recipeId && !result.has(recipeId)) {
      result.set(recipeId, [source]);
    }
  }

  return result;
}

function collectBiomeFurnitureSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const dungeons = fiddle.dungeons as Record<string, Record<string, unknown>> | undefined;
  if (!dungeons) return new Map();

  const result = new Map<string, RecipeSource[]>();

  const dungeonsData = dungeons.dungeons as Record<string, unknown> | undefined;
  if (!dungeonsData) return result;

  const biomes = Array.isArray(dungeonsData.biomes) ? (dungeonsData.biomes as unknown[]) : [];

  for (const biome of biomes) {
    if (typeof biome !== "object" || biome === null) continue;
    const biomeObj = biome as Record<string, unknown>;

    const furniture = Array.isArray(biomeObj.furniture) ? (biomeObj.furniture as unknown[]) : [];

    for (const itemId of furniture) {
      if (typeof itemId !== "string") continue;

      const recipeId = itemIdToRecipeId.get(itemId);
      if (!recipeId) continue;

      if (result.has(recipeId)) continue;
      const sources = result.get(recipeId) ?? [];
      sources.push({ perk: "natural_beauty", type: "perk" });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function buildPresentations(group: RawRecipeEntry[]): RecipePresentation[] {
  const byName = new Map<string, string[]>();
  for (const entry of group) {
    const ids = byName.get(entry.name) ?? [];
    ids.push(entry.itemId);
    byName.set(entry.name, ids);
  }

  return [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, ids]) => ({
      itemIds: ids.sort((a, b) => a.localeCompare(b)) as ItemId[],
      name,
    }));
}

function collectChickenStatueSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
): Map<string, RecipeSource[]> {
  const chickenStatue = fiddle.chicken_statue as Record<string, unknown> | undefined;
  if (!chickenStatue) return new Map();

  const result = new Map<string, RecipeSource[]>();

  const common = chickenStatue.common as Record<string, unknown> | undefined;
  if (!common) return result;

  const rolls = ["small_roll", "medium_roll", "large_roll"];
  for (const rollKey of rolls) {
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
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ type: "chicken_statue" });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function collectDungeonDelicacySources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const dungeons = fiddle.dungeons as Record<string, Record<string, unknown>> | undefined;
  if (!dungeons) return new Map();

  const result = new Map<string, RecipeSource[]>();

  const dungeonsData = dungeons.dungeons as Record<string, unknown> | undefined;
  if (!dungeonsData) return result;

  const biomes = Array.isArray(dungeonsData.biomes) ? (dungeonsData.biomes as unknown[]) : [];

  for (const biome of biomes) {
    if (typeof biome !== "object" || biome === null) continue;
    const biomeObj = biome as Record<string, unknown>;

    const delicacyArrays = ["dungeon_delicacies", "taste_maker"];
    for (const arrayKey of delicacyArrays) {
      const items = Array.isArray(biomeObj[arrayKey]) ? (biomeObj[arrayKey] as unknown[]) : [];

      for (const itemId of items) {
        if (typeof itemId !== "string") continue;

        const recipeId = itemIdToRecipeId.get(itemId);
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({ type: "mine_zone" });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}

function collectDragonForgeSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const items = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  if (!items?.other?.blacksmithing) return new Map();

  const result = new Map<string, RecipeSource[]>();

  for (const [itemId, item] of Object.entries(items.other.blacksmithing)) {
    if (itemId === "default" || typeof item !== "object" || item === null) continue;
    if (item.recipe_is_default) continue;

    const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];
    if (!tags.includes("blacksmithing")) continue;

    const name = item.name as string | undefined;
    if (!name || !itemId.startsWith("dragon_forged_")) continue;

    const recipeId = itemIdToRecipeId.get(itemId);
    if (!recipeId) continue;

    const sources = result.get(recipeId) ?? [];
    sources.push({ type: "dragon_forge" });
    result.set(recipeId, sources);
  }

  return result;
}

function collectFestivalScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
): Map<string, RecipeSource[]> {
  const festivals = fiddle.festivals as Record<string, Record<string, unknown>> | undefined;
  if (!festivals) return new Map();

  const result = new Map<string, RecipeSource[]>();

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
        );
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({ festivalId, storeId: vendorStoreId, type: "festival" });
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
): Map<string, RecipeSource[]> {
  const fishing = fiddle.fishing as Record<string, unknown> | undefined;
  if (!fishing) return new Map();

  const result = new Map<string, RecipeSource[]>();

  const chestTables = fishing.chest_tables as Record<string, unknown> | undefined;
  if (!chestTables) return result;

  for (const [, tierData] of Object.entries(chestTables)) {
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
        "fishing/chest_tables",
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ type: "treasure_chest" });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function collectLetterScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
): Map<string, RecipeSource[]> {
  const letters = fiddle.letters as Record<string, Record<string, unknown>> | undefined;
  if (!letters) return new Map();

  const result = new Map<string, RecipeSource[]>();

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
      );
      if (!recipeId) continue;

      let trigger: "donated_item" | "shipped_item" | undefined;
      let triggerItemId: string | undefined;

      if (requirements) {
        if (typeof requirements.shipped_item === "string") {
          trigger = "shipped_item";
          triggerItemId = requirements.shipped_item;
        } else if (typeof requirements.donated_item === "string") {
          trigger = "donated_item";
          triggerItemId = requirements.donated_item;
        }
      }

      const sources = result.get(recipeId) ?? [];
      if (trigger && triggerItemId) {
        sources.push({ trigger, triggerItemId: triggerItemId as ItemId, type: "letter" });
      } else {
        console.warn(
          `  Warning: letter "${letterId}" has recipe_scroll but no recognized requirement trigger — adding generic letter source`,
        );
        sources.push({ type: "letter" });
      }
      result.set(recipeId, sources);
    }
  }

  return result;
}

function collectMuseumScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
): Map<string, RecipeSource[]> {
  const museumWings = fiddle.museum_wings as Record<string, Record<string, unknown>> | undefined;
  if (!museumWings) return new Map();

  const result = new Map<string, RecipeSource[]>();

  for (const [wingId, wing] of Object.entries(museumWings)) {
    if (wingId === "default" || typeof wing !== "object" || wing === null) continue;

    const wingObj = wing;
    const rewards = Array.isArray(wingObj.rewards) ? wingObj.rewards : [];
    for (const reward of rewards) {
      if (typeof reward !== "object" || reward === null) continue;
      const rewardObj = reward as Record<string, unknown>;
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
        );
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({ type: "museum_donation", wingId: wingId as WingId });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}

function collectPerkSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const items = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  if (!items) return new Map();

  const result = new Map<string, RecipeSource[]>();

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

  for (const subCategories of Object.values(items)) {
    if (typeof subCategories !== "object" || subCategories === null) continue;
    for (const [subCatKey, categoryItems] of Object.entries(subCategories)) {
      if (typeof categoryItems !== "object" || categoryItems === null) continue;

      const subCatPerk = perkBySubCategory[subCatKey];

      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (itemId === "default" || typeof item !== "object" || item === null) continue;

        const perk = perkByItemId[itemId] ?? subCatPerk;
        if (!perk) continue;

        const recipeId = itemIdToRecipeId.get(itemId);
        if (recipeId && !result.has(recipeId)) {
          result.set(recipeId, [{ perk, type: "perk" }]);
        }
      }
    }
  }

  return result;
}

function collectScrollBundleSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const items = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  if (!items) return new Map();

  const result = new Map<string, RecipeSource[]>();

  const bundleIdToSetTag = new Map<string, string>();
  for (const subCategories of Object.values(items)) {
    if (typeof subCategories !== "object" || subCategories === null) continue;
    for (const categoryItems of Object.values(subCategories)) {
      if (typeof categoryItems !== "object" || categoryItems === null) continue;
      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (itemId === "default" || typeof item !== "object" || item === null) continue;
        const setUnlock = item.set_unlock as string | undefined;
        if (setUnlock) {
          bundleIdToSetTag.set(itemId, setUnlock);
        }
      }
    }
  }

  if (bundleIdToSetTag.size === 0) return result;

  const setTagToStoreId = new Map<string, string>();
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (stores) {
    for (const [storeId, store] of Object.entries(stores)) {
      if (storeId === "default" || typeof store !== "object" || store === null) continue;
      const categories = Array.isArray(store.categories) ? store.categories : [];

      for (const category of categories) {
        if (typeof category !== "object" || category === null) continue;
        const cat = category as Record<string, unknown>;

        const allStock: unknown[] = [];
        if (Array.isArray(cat.constant_stock)) allStock.push(...cat.constant_stock);
        if (Array.isArray(cat.random_stock)) allStock.push(...cat.random_stock);
        const seasonal = cat.seasonal as Record<string, unknown> | undefined;
        if (seasonal) {
          for (const val of Object.values(seasonal)) {
            if (Array.isArray(val)) allStock.push(...val);
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
            setTagToStoreId.set(setTag, storeId);
          }
        }
      }
    }
  }

  for (const subCategories of Object.values(items)) {
    if (typeof subCategories !== "object" || subCategories === null) continue;
    for (const categoryItems of Object.values(subCategories)) {
      if (typeof categoryItems !== "object" || categoryItems === null) continue;
      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (itemId === "default" || typeof item !== "object" || item === null) continue;

        const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];

        for (const [setTag, storeId] of setTagToStoreId) {
          if (tags.includes(setTag)) {
            const recipeId = itemIdToRecipeId.get(itemId);
            if (recipeId && !result.has(recipeId)) {
              result.set(recipeId, [{ storeId, type: "scroll_bundle" }]);
            }
          }
        }
      }
    }
  }

  return result;
}

function collectQuestScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
): Map<string, RecipeSource[]> {
  const quests = fiddle.quests as
    Record<string, Record<string, Record<string, unknown>>> | undefined;
  if (!quests) return new Map();

  const result = new Map<string, RecipeSource[]>();

  for (const questType of QUEST_TYPES_WITH_SCROLLS) {
    const questGroup = quests[questType];
    if (!questGroup) continue;

    for (const [questId, quest] of Object.entries(questGroup)) {
      if (questId === "default" || typeof quest !== "object" || quest === null) continue;

      const questObj = quest;
      const rewards = Array.isArray(questObj.rewards) ? questObj.rewards : [];
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
          `${questType}/${questId}`,
        );
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({
          questId: questId as QuestId,
          questType,
          type: "quest",
        });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}

function collectRenownRecipeSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const renown = fiddle.renown as Record<string, unknown> | undefined;
  if (!renown) return new Map();

  const result = new Map<string, RecipeSource[]>();
  const rewards = Array.isArray(renown.rewards) ? renown.rewards : [];

  for (const reward of rewards) {
    if (typeof reward !== "object" || reward === null) continue;
    const itemId = (reward as Record<string, unknown>).item as string | undefined;
    if (!itemId) continue;

    const recipeId = itemIdToRecipeId.get(itemId);
    if (!recipeId || result.has(recipeId)) continue;

    result.set(recipeId, [{ type: "renown" }]);
  }

  return result;
}

function collectRecipeEntries(fiddle: ParsedGameData): RawRecipeEntry[] {
  const itemsRoot = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  if (!itemsRoot) return [];

  const entries: RawRecipeEntry[] = [];

  for (const [topCategory, subCategories] of Object.entries(itemsRoot)) {
    if (typeof subCategories !== "object" || subCategories === null) continue;
    for (const [subCategory, categoryItems] of Object.entries(subCategories)) {
      if (typeof categoryItems !== "object" || categoryItems === null) continue;
      if (topCategory === "other" && subCategory === "unreviewed_new_items") continue;
      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (itemId === "default") continue;
        if (typeof item !== "object" || item === null) continue;

        const itemObj = item;
        const hasRecipe = Array.isArray(itemObj.recipe) || typeof itemObj.recipe_key === "string";
        const isDefault = itemObj.recipe_is_default === true;

        if (!hasRecipe && isDefault) {
          console.log(
            `  Diagnostic: "${itemId}" has recipe_is_default but no recipe array or recipe_key — skipped`,
          );
          continue;
        }

        if (!hasRecipe) continue;

        const recipeKey = itemObj.recipe_key as string | undefined;
        const recipeId = recipeKey ?? itemId;
        const name = (itemObj.name as string | undefined) ?? itemId;

        entries.push({ defaultUnlocked: isDefault, itemId, name, recipeId });
      }
    }
  }

  return entries;
}

function collectStoreScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
): Map<string, RecipeSource[]> {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return new Map();

  const result = new Map<string, RecipeSource[]>();

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

          if (scrollTarget) {
            const recipeId = resolveScrollTarget(
              scrollTarget,
              itemIdToRecipeId,
              knownRecipeIds,
              `stores/${storeId}`,
            );
            if (recipeId) {
              const sources = result.get(recipeId) ?? [];
              sources.push({ storeId, type: "store" });
              result.set(recipeId, sources);
            }
            continue;
          }

          if (obj.include_recipe === true) {
            const itemId = obj.item as string | undefined;
            if (!itemId) continue;
            const recipeId = itemIdToRecipeId.get(itemId);
            if (!recipeId) continue;
            const sources = result.get(recipeId) ?? [];
            sources.push({ storeId, type: "store" });
            result.set(recipeId, sources);
          }
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
): Map<string, RecipeSource[]> {
  const wishingWell = fiddle.wishing_well as Record<string, unknown> | undefined;
  if (!wishingWell) return new Map();

  const result = new Map<string, RecipeSource[]>();

  const common = wishingWell.common as Record<string, unknown> | undefined;
  if (!common) return result;

  const rolls = ["small_roll", "medium_roll", "large_roll"];
  for (const rollKey of rolls) {
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
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ type: "wishing_well" });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function compareRecipeSources(a: RecipeSource, b: RecipeSource): number {
  const cmp = a.type.localeCompare(b.type);
  if (cmp !== 0) return cmp;
  return sourceKey(a).localeCompare(sourceKey(b));
}

function deduplicateSources(sources: RecipeSource[]): RecipeSource[] {
  const seen = new Set<string>();
  const result: RecipeSource[] = [];
  const sorted = [...sources].sort(compareRecipeSources);
  for (const s of sorted) {
    const key = sourceKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(s);
  }
  return result;
}

function resolveScrollTarget(
  scrollTarget: string,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
  context: string,
): string | undefined {
  const recipeId = itemIdToRecipeId.get(scrollTarget);
  if (recipeId) return recipeId;
  if (knownRecipeIds.has(scrollTarget)) return scrollTarget;
  console.warn(`  Warning: scroll target "${scrollTarget}" in ${context} has no matching item`);
  return undefined;
}

function sourceKey(s: RecipeSource): string {
  return JSON.stringify(s, Object.keys(s).sort());
}

function validateRecipeIdCollisions(
  itemIdToRecipeId: Map<string, string>,
  grouped: Map<string, RawRecipeEntry[]>,
): void {
  for (const [itemId, recipeId] of itemIdToRecipeId) {
    if (itemId === recipeId) continue;
    if (grouped.has(itemId) && itemId !== recipeId) {
      console.warn(
        `  Warning: item ID "${itemId}" is also a recipe key for a different group — potential collision`,
      );
    }
  }
}
