import { entriesFromRecord, entriesToRecord } from "./entry.js";

import type { LocationId, Source } from "#lib/types/acquisition.js";
import type {
  MinesBiomeId,
  QuestId,
  Season,
  StoreId,
  StoreUpgradeAction,
} from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

export const STORE_UNLOCK_QUESTS_ENTRIES = entriesFromRecord<QuestId>(
  {
    darcy: "repair_the_bridge" as QuestId,
    louis: "repair_the_bridge" as QuestId,
    merri: "repair_the_bridge" as QuestId,
    vera: "repair_the_bridge" as QuestId,
    wheedle: "upgrade_the_saturday_market" as QuestId,
    zorel: "upgrade_the_saturday_market_plaza" as QuestId,
  },
  "stores.toml merchant entries; story repair quests in quests/story_quests.toml",
  "Merchant unlock edges are runtime-only",
);
export const STORE_UNLOCK_QUESTS = entriesToRecord(STORE_UNLOCK_QUESTS_ENTRIES);

export const VILLAGER_GATES_ENTRIES = entriesFromRecord<VisibilityCondition>(
  {
    caldarus: { type: "questCompleted", questId: "breaking_the_fire_seal" as QuestId },
    darcy: { type: "questCompleted", questId: "repair_the_bridge" as QuestId },
    louis: { type: "questCompleted", questId: "repair_the_bridge" as QuestId },
    merri: { type: "questCompleted", questId: "repair_the_bridge" as QuestId },
    seridia: { type: "questCompleted", questId: "breaking_the_final_seal" as QuestId },
    stillwell: {
      type: "questCompleted",
      questId: "upgrade_the_saturday_market_plaza" as QuestId,
    },
    taliferro: { type: "questCompleted", questId: "upgrade_the_saturday_market" as QuestId },
    vera: { type: "questCompleted", questId: "repair_the_bridge" as QuestId },
    wheedle: { type: "questCompleted", questId: "upgrade_the_saturday_market" as QuestId },
    zorel: {
      type: "questCompleted",
      questId: "upgrade_the_saturday_market_plaza" as QuestId,
    },
  },
  "npcs.toml and story quests for bridge, market, and seal progression",
  "Villager introductions are not encoded as NPC requirements",
);
export const VILLAGER_GATES = entriesToRecord(VILLAGER_GATES_ENTRIES);

export const SPELL_SOURCES_ENTRIES = entriesFromRecord<QuestId>(
  {
    fire_breath: "breaking_the_fire_seal" as QuestId,
    growth: "the_earth_tablet" as QuestId,
    sacred_light: "find_the_magic_key" as QuestId,
    summon_rain: "the_water_tablet" as QuestId,
  },
  "spells.toml; post-seal cutscenes spell_to_unlock; story quest seal chain",
  "Post-seal cutscenes lack direct quest links",
);
export const SPELL_SOURCES = entriesToRecord(SPELL_SOURCES_ENTRIES);

export const STORY_PREREQUISITE_OVERRIDES_ENTRIES = entriesFromRecord<QuestId[]>(
  {
    ["breaking_the_final_seal" as QuestId]: ["the_dragonsworn_tablet" as QuestId],
    ["breaking_the_fire_seal" as QuestId]: ["the_fire_tablet" as QuestId],
    ["breaking_the_ruins_seal" as QuestId]: ["creating_the_void_mass" as QuestId],
    ["creating_the_void_mass" as QuestId]: ["find_the_magic_key" as QuestId],
    ["delivering_the_sealing_scroll" as QuestId]: ["procuring_the_sealing_scroll" as QuestId],
    ["find_the_magic_key" as QuestId]: ["breaking_the_fire_seal" as QuestId],
    ["the_dragonsworn_tablet" as QuestId]: ["breaking_the_ruins_seal" as QuestId],
  },
  "quests/story_quests.toml; letters.toml and cutscenes reviewed for quest triggers",
  "Runtime quest starts omit completed_quest prerequisite edges",
);
export const STORY_PREREQUISITE_OVERRIDES = entriesToRecord(STORY_PREREQUISITE_OVERRIDES_ENTRIES);

export const KNOWN_STORES_ENTRIES = entriesFromRecord<true>(
  {
    balor: true,
    blacksmith: true,
    carpenter: true,
    darcy: true,
    elsie_spring_festival: true,
    general: true,
    hayden: true,
    inn: true,
    louis: true,
    maple_spring_festival: true,
    merri: true,
    nora_souvenir_stall: true,
    terithia: true,
    valens_clinic: true,
    vera: true,
    wheedle: true,
    zorel: true,
  },
  "stores.toml store names",
  "A new store throws so its English article (`en-grammar.ts`) and upgrade action get reviewed",
);
export const KNOWN_STORES = entriesToRecord(KNOWN_STORES_ENTRIES);

export const UPGRADE_ACTIONS_ENTRIES = entriesFromRecord<StoreUpgradeAction>(
  {
    general: "repair",
  },
  "stores.toml general upgrades and repair_general_store story quest",
  "General store action is a repair rather than a generic upgrade",
);
export const UPGRADE_ACTIONS = entriesToRecord(UPGRADE_ACTIONS_ENTRIES);

export const MINE_SUBCAT_TO_BIOME_ENTRIES = entriesFromRecord(
  {
    deep_earth: "deep_earth" as MinesBiomeId,
    lava_caves: "lava_caves" as MinesBiomeId,
    ruins: "ancient_ruins" as MinesBiomeId,
    tide_caverns: "tide_caverns" as MinesBiomeId,
    upper_mines: "upper_mines" as MinesBiomeId,
  },
  "items/mines category names and dungeons.toml biome names",
  "The ruins category uses the Ancient Ruins biome identifier",
);
export const MINE_SUBCAT_TO_BIOME = entriesToRecord(MINE_SUBCAT_TO_BIOME_ENTRIES);

export const GOLDEN_PRODUCT_TO_ANIMAL_ENTRIES = entriesFromRecord(
  {
    animal_currency: "chicken",
    bull_horn: "cow",
    golden_alpaca_wool: "alpaca",
    golden_bristle: "horse",
    golden_cow_milk: "cow",
    golden_duck_egg: "duck",
    golden_duck_feather: "duck",
    golden_egg: "chicken",
    golden_feather: "chicken",
    golden_horse_hair: "horse",
    golden_rabbit_wool: "rabbit",
    golden_sheep_wool: "sheep",
  },
  "items/other/animal_products.toml descriptions and animals.toml produce families",
  "Golden products lack the native animal_product owner field",
);
export const GOLDEN_PRODUCT_TO_ANIMAL = entriesToRecord(GOLDEN_PRODUCT_TO_ANIMAL_ENTRIES);

export const PERK_BY_SUBCATEGORY_ENTRIES = entriesFromRecord(
  {
    faux_plant_set: "ornamental",
    void_set: "void_crafting",
  },
  "skills.toml ornamental and void_crafting perks; item furniture set categories",
  "Recipe unlock rewards omit set-to-perk acquisition edges",
);
export const PERK_BY_SUBCATEGORY = entriesToRecord(PERK_BY_SUBCATEGORY_ENTRIES);

export const PERK_BY_ITEM_ID_ENTRIES = entriesFromRecord(
  {
    big_bell: "the_bell_tolls",
    essence_stone_giant: "magic_design",
    ocarina_sprite_statue: "the_bell_tolls",
    water_sprite_statue_large_v1: "big_water_sprites",
  },
  "skills.toml magic_design, the_bell_tolls, and big_water_sprites perks; corresponding item recipes",
  "Recipe acquisition edges are runtime-only",
);
export const PERK_BY_ITEM_ID = entriesToRecord(PERK_BY_ITEM_ID_ENTRIES);

export const EXCEPTIONS_ENTRIES = entriesFromRecord<Source>(
  {
    engagement_ring: { type: "engagement" },
    farm_bridge: {
      type: "upgrade",
      storeId: "carpenter" as StoreId,
      upgradeId: "farm_bridge",
    },
    kitchen_salt_and_pepper_shakers: { type: "default" },
    stairs: { type: "upgrade", storeId: "carpenter" as StoreId, upgradeId: "stairs" },
    water_sprite_statue_v1: { type: "secret_chest", locationId: "beach_secret" as LocationId },
  },
  "items furniture recipes; engagement, carpenter upgrades, and Beach Cave chest runtime rewards",
  "Recipe acquisition path is not represented by a native reward array",
);
export const EXCEPTIONS = entriesToRecord(EXCEPTIONS_ENTRIES);

export const FESTIVAL_SEASON_MAP_ENTRIES = entriesFromRecord<Season>(
  {
    fall: "fall",
    harvest: "fall",
    spring: "spring",
    summer: "summer",
    winter: "winter",
  },
  "festivals.toml festival IDs and their native calendar seasons",
  "Harvest festival ID is an alias for fall season",
);
export const FESTIVAL_SEASON_MAP = entriesToRecord(FESTIVAL_SEASON_MAP_ENTRIES);

/** Preserved pending real-playthrough evidence; issue 638 (private beta). */
export const CROWN_QUEST_GATE = {
  evidence: "Existing Copper Star placeholder; confirmation tracked in #638",
  id: "crown_quests",
  reason: "Do not invent a new gate before the playthrough review",
  value: 20,
};
export const HAYDENS_BARN_GATE = {
  evidence: "animals.toml unlock conditions and Hayden barn repair story quest",
  id: "repair_haydens_barn",
  reason: "Animal unlock predicate needs a quest projection",
  value: "repair_haydens_barn" as QuestId,
};
export const DRAGON_FORGE_RULE = {
  evidence: "items/armor dragon_forged recipes and blacksmithing tag; dragon forge runtime station",
  id: "dragon_forged_",
  reason: "Blacksmithing tag alone does not distinguish the dragon forge",
  value: "dragon_forge" as const,
};
export function isDragonForgedItem(id: string): boolean {
  return id.startsWith(DRAGON_FORGE_RULE.id);
}
export function isPregnancyQuest(id: string): boolean {
  return id.endsWith("_pregnancy_request");
}

export const CUTSCENE_QUEST_ENTRIES = entriesFromRecord(
  {
    break_fire_seal: { phase: "completed" as const, questId: "breaking_the_fire_seal" as QuestId },
    destroy_vines_eastern_road: {
      phase: "completed" as const,
      questId: "breaking_the_fire_seal" as QuestId,
    },
    dragon_tablet_pt_4: {
      phase: "completed" as const,
      questId: "breaking_the_final_seal" as QuestId,
    },
  },
  "cutscenes.toml post-seal scenes and story quest seal progression",
  "Runtime post-seal cutscenes omit direct quest_to_progress links",
);
export const CUTSCENE_QUESTS = entriesToRecord(CUTSCENE_QUEST_ENTRIES);
