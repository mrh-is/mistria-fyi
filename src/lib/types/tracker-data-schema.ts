import * as v from "valibot";

import {
  CUTSCENE_SOURCE_IDS,
  DATE_INSPIRATION_DROP_ACTIVITIES,
  UPGRADE_IDS,
} from "./acquisition.js";
import { SEASONS, STORE_UPGRADE_ACTIONS, WEATHERS } from "./tracker-data.js";

import type { AvailabilityCondition, JsonValue } from "./acquisition.js";
import type { VisibilityCondition } from "./visibility.js";

const id = <const Name extends string>(name: Name) => v.pipe(v.string(), v.brand(name));
const number = v.pipe(v.number(), v.finite());
const nonEmpty = <T extends v.GenericSchema>(schema: T) => v.tupleWithRest([schema], schema);
const season = v.picklist(SEASONS);
const weather = v.picklist(WEATHERS);
const questType = v.picklist(["cooking", "crown", "fetch", "heart", "mission", "story"]);

export const DaySchema = v.strictObject({ day: number, season });
export const LevelRangeSchema = v.strictObject({ start: number, end: number });

// Only the recursive edges need explicit types (TypeScript cannot infer a lazy cycle).
// Leaf fields and every nonrecursive entity are inferred directly from their schemas.
export const VisibilityLeafSchema = v.variant("type", [
  v.strictObject({ type: v.literal("always") }),
  v.strictObject({ type: v.literal("hasUpperFloor") }),
  v.strictObject({ type: v.literal("heartLevel"), level: number, villagerId: id("VillagerId") }),
  v.strictObject({ type: v.literal("isDating") }),
  v.strictObject({ type: v.literal("married"), villagerId: id("VillagerId") }),
  v.strictObject({ type: v.literal("mineFloor"), floor: number }),
  v.strictObject({ type: v.literal("perkUnlocked"), perkId: id("PerkId") }),
  v.strictObject({ type: v.literal("questAvailable"), questId: id("QuestId") }),
  v.strictObject({ type: v.literal("questCompleted"), questId: id("QuestId") }),
  v.strictObject({ type: v.literal("reachedSeason"), season }),
  v.strictObject({ type: v.literal("renownLevel"), level: number }),
  v.strictObject({ type: v.literal("skillLevel"), level: number, skillId: id("SkillId") }),
  v.strictObject({ type: v.literal("villagerKnown"), villagerId: id("VillagerId") }),
]);
const VisibilitySchema: v.GenericSchema<unknown, VisibilityCondition> = v.lazy(() =>
  v.variant("type", [
    VisibilityLeafSchema,
    v.strictObject({ type: v.literal("and"), conditions: nonEmpty(VisibilitySchema) }),
    v.strictObject({ type: v.literal("or"), conditions: nonEmpty(VisibilitySchema) }),
  ]),
);

const JsonValueSchema: v.GenericSchema<unknown, JsonValue> = v.lazy(() =>
  v.union([
    v.null(),
    v.boolean(),
    number,
    v.string(),
    v.array(JsonValueSchema),
    v.record(v.string(), JsonValueSchema),
  ]),
);
export const AvailabilityLeafSchema = v.variant("type", [
  v.strictObject({ type: v.literal("always") }),
  v.strictObject({ type: v.literal("dateUnlocked"), dateId: v.optional(id("DateId")) }),
  v.strictObject({
    type: v.literal("gamePredicate"),
    predicate: v.string(),
    value: JsonValueSchema,
  }),
  v.strictObject({ type: v.literal("hasUpperFloor") }),
  v.strictObject({ type: v.literal("heartLevel"), level: number, villagerId: id("VillagerId") }),
  v.strictObject({ type: v.literal("isDating") }),
  v.strictObject({ type: v.literal("mineFloor"), floor: number }),
  v.strictObject({ type: v.literal("perkUnlocked"), perkId: id("PerkId") }),
  v.strictObject({
    type: v.literal("quest"),
    questId: id("QuestId"),
    state: v.picklist(["available", "completed"]),
  }),
  v.strictObject({ type: v.literal("reachedSeason"), season }),
  v.strictObject({ type: v.literal("season"), seasons: nonEmpty(season) }),
  v.strictObject({ type: v.literal("skillLevel"), level: number, skillId: id("SkillId") }),
  v.strictObject({ type: v.literal("time"), start: number, end: number }),
  v.strictObject({ type: v.literal("weather"), weathers: v.array(weather) }),
]);
const AvailabilitySchema: v.GenericSchema<unknown, AvailabilityCondition> = v.lazy(() =>
  v.variant("type", [
    AvailabilityLeafSchema,
    v.strictObject({ type: v.literal("all"), conditions: nonEmpty(AvailabilitySchema) }),
    v.strictObject({ type: v.literal("any"), conditions: nonEmpty(AvailabilitySchema) }),
    v.strictObject({ type: v.literal("not"), condition: AvailabilitySchema }),
  ]),
);
export const SourceDetailsSchema = v.strictObject({
  availability: v.optional(AvailabilitySchema),
  visibility: v.optional(VisibilitySchema),
});
const source = <const Type extends string, const Entries extends v.ObjectEntries>(
  type: Type,
  entries: Entries,
) => v.strictObject({ ...SourceDetailsSchema.entries, ...entries, type: v.literal(type) });
export const SourceSchema = v.variant("type", [
  source("animal_product", { animalId: id("AnimalId") }),
  source("artifact_dig", { locationIds: v.optional(nonEmpty(id("LocationId"))) }),
  source("artifact_replicator", { originalItemId: id("ItemId") }),
  source("bait_fish", { baitItemIds: nonEmpty(id("ItemId")) }),
  source("breed", {}),
  source("bug_catch", { locationIds: v.optional(nonEmpty(id("LocationId"))) }),
  source("chicken_statue", { cost: number }),
  source("chicken_statue", { unlockCondition: v.literal("breed_all_chicken_tiers") }),
  source("crop", { seedItemId: id("ItemId") }),
  source("cutscene", { cutsceneId: v.picklist(CUTSCENE_SOURCE_IDS) }),
  source("date", { dateId: id("DateId") }),
  source("date_inspiration", { itemId: id("ItemId") }),
  source("date_inspiration_drop", { activity: v.literal("mines_chest"), dateId: id("DateId") }),
  source("date_inspiration_drop", {
    activity: v.picklist(
      DATE_INSPIRATION_DROP_ACTIVITIES.filter((activity) => activity !== "mines_chest"),
    ),
    dateId: id("DateId"),
    locationId: id("LocationId"),
  }),
  v.strictObject({ type: v.literal("default") }),
  source("dive", { waterTypes: v.optional(nonEmpty(id("WaterType"))) }),
  source("donate_item", { triggerItemId: id("ItemId") }),
  source("engagement", {}),
  source("equipment", { itemId: id("ItemId") }),
  source("festival", { festivalId: id("FestivalId"), storeId: v.optional(id("StoreId")) }),
  source("festival_activity", { activityId: id("ActivityId"), festivalId: id("FestivalId") }),
  source("fish", { waterTypes: v.optional(nonEmpty(id("WaterType"))) }),
  source("fish_trap", { baitItemIds: nonEmpty(id("ItemId")) }),
  source("forage", { locationIds: v.optional(nonEmpty(id("LocationId"))) }),
  source("horse_statue", { cost: number, questId: id("QuestId") }),
  source("letter", { letterId: v.string(), trigger: v.picklist(["birthday", "condition"]) }),
  source("lost_and_found", {}),
  source("mine", { biomeId: id("MinesBiomeId") }),
  source("mine_fish", { biomeId: v.optional(id("MinesBiomeId")) }),
  source("mines_chest", {
    biomeId: id("MinesBiomeId"),
    lootGroup: v.optional(id("DungeonLootGroup")),
    perkId: v.optional(id("PerkId")),
  }),
  source("mines_dig_site", { biomeId: id("MinesBiomeId"), perkId: id("PerkId") }),
  source("monster", { monsterId: id("MonsterId") }),
  source("monster_feed", { monsterId: id("MonsterId") }),
  source("museum_donation", { setCount: number, wingId: id("MuseumWingId") }),
  source("perk", { perkId: id("PerkId") }),
  source("perk_drop", { activity: v.literal("crop_harvest"), perkId: id("PerkId") }),
  source("proposal", { villagerId: id("VillagerId") }),
  source("quest", {
    challengeRecipeId: v.optional(id("RecipeId")),
    choiceId: v.optional(id("DialogueChoiceId")),
    questId: id("QuestId"),
    questType: v.optional(questType),
    requestedItemId: v.optional(id("ItemId")),
    trigger: v.picklist(["completion", "dialogue_choice"]),
  }),
  source("reach_day", {
    triggerDate: v.strictObject({ ...DaySchema.entries, year: v.optional(number) }),
  }),
  source("recipe", {
    method: v.picklist(["cook", "craft", "dragon_forge", "mill", "smith"]),
    recipeId: id("RecipeId"),
  }),
  source("renown", { level: number }),
  source("ritual_chamber", { perkId: id("PerkId") }),
  source("scroll_bundle", { bundleItemId: id("ItemId"), storeId: id("StoreId") }),
  source("secret_chest", { locationId: id("LocationId") }),
  source("ship_item", { triggerItemId: id("ItemId") }),
  source("spouseGift", { villagerId: id("VillagerId") }),
  source("station", { stationId: id("StationId") }),
  source("store", { storeId: id("StoreId") }),
  source("treasure_chest", { tier: id("TreasureChestTierId") }),
  source("tree", { saplingItemId: id("ItemId") }),
  source("upgrade", { storeId: id("StoreId"), upgradeId: v.picklist(UPGRADE_IDS) }),
  source("wedding", {}),
  source("wishing_well", { cost: number }),
]);

/** Quests and spells may have no source; the other tracked entities require at least one. */
export const TrackerEntitySchema = v.strictObject({
  sources: v.array(SourceSchema),
  visibility: v.optional(VisibilitySchema),
});
export const SourcedEntitySchema = v.strictObject({
  ...TrackerEntitySchema.entries,
  sources: nonEmpty(SourceSchema),
});
/** Labels resolve through getName("ui", id, locale), so categories store no name. */
export const AlmanacEntrySchema = v.strictObject({
  itemIds: v.array(id("ItemId")),
  recipeId: v.optional(id("RecipeId")),
});
export const AlmanacCategorySchema = v.strictObject({ items: v.array(AlmanacEntrySchema) });
export const AnimalVariantSchema = v.strictObject({
  source: v.variant("type", [source("breed", {}), v.strictObject({ type: v.literal("default") })]),
});
export const AnimalVariantTierSchema = v.record(id("AnimalVariantId"), AnimalVariantSchema);
export const AnimalSchema = v.strictObject({
  cosmetics: v.record(id("CosmeticId"), SourcedEntitySchema),
  variantTiers: v.array(AnimalVariantTierSchema),
  visibility: v.optional(VisibilitySchema),
});
const cosmeticSlot = v.picklist([
  "back",
  "bottom",
  "eyes",
  "face_gear",
  "facial_hair",
  "feet",
  "hair",
  "head_gear",
  "skin",
  "top",
]);
export const CosmeticSchema = v.strictObject({
  ...SourcedEntitySchema.entries,
  /** A ui/character_customization.toml section; the wardrobe menu's slot. */
  slot: cosmeticSlot,
  /** A ui_sub_category key; its label lives in the cosmetics/subcategories locale chunk. */
  subCategory: v.string(),
});
export const CosmeticSlotMetaSchema = v.strictObject({ subCategories: v.array(v.string()) });
export const FestivalSchema = v.strictObject({ date: DaySchema });
export const HeartLevelChangeSchema = v.strictObject({
  level: number,
  villagerId: id("VillagerId"),
});
export const CookingQuestSchema = v.strictObject({
  ...TrackerEntitySchema.entries,
  recipeId: id("RecipeId"),
});
export const FetchQuestSchema = v.strictObject({
  ...TrackerEntitySchema.entries,
  itemId: id("ItemId"),
  rewardRecipeId: v.optional(id("RecipeId")),
  villager: id("VillagerId"),
});
export const HeartQuestSchema = v.strictObject({
  ...TrackerEntitySchema.entries,
  heartLevel: number,
  villager: id("VillagerId"),
});
export const StoryQuestSchema = v.strictObject({
  ...TrackerEntitySchema.entries,
  heartLevelChanges: v.optional(v.array(HeartLevelChangeSchema)),
});
export const ItemSchema = v.strictObject({
  ...SourcedEntitySchema.entries,
  category: v.string(),
  /** Fixed grants from native set_unlock tags; absent for runtime-target scrolls. */
  recipeUnlocks: v.optional(v.array(id("RecipeId"))),
});
export const MinesBiomeSchema = v.strictObject({
  floors: LevelRangeSchema,
  id: id("MinesBiomeId"),
});
export const MountSchema = v.strictObject({
  appearances: v.record(id("MountAppearanceId"), SourcedEntitySchema),
});
export const MuseumWingSetSchema = v.strictObject({ items: v.array(id("ItemId")) });
export const MuseumWingSchema = v.strictObject({
  sets: v.record(id("MuseumWingSetId"), MuseumWingSetSchema),
});
const emptyEntry = v.record(v.string(), v.never());
export const PerkTierSchema = v.record(id("PerkId"), emptyEntry);
export const SkillSchema = v.strictObject({
  perkTiers: v.strictTuple([
    PerkTierSchema,
    PerkTierSchema,
    PerkTierSchema,
    PerkTierSchema,
    PerkTierSchema,
  ]),
});
export const StoreSchema = v.strictObject({
  upgradeAction: v.optional(v.picklist(STORE_UPGRADE_ACTIONS)),
  visibility: v.optional(VisibilitySchema),
});
export const TownRankSchema = v.strictObject({ levels: LevelRangeSchema });
export const VillagerSchema = v.strictObject({
  // Player-facing names live in per-locale chunks; strictObject rejects untranslated names here.
  birthday: DaySchema,
  dateable: v.optional(v.literal(true)),
  visibility: v.optional(VisibilitySchema),
});

/** The generated JSON contract. Runtime imports belong to the pipeline, never the client loader. */
export const TrackerDataSchema = v.strictObject({
  almanac: v.record(id("AlmanacCategoryId"), AlmanacCategorySchema),
  animals: v.record(id("AnimalId"), AnimalSchema),
  categoryVisibility: v.record(v.union([v.literal("dates"), questType]), VisibilitySchema),
  cosmetics: v.record(id("CosmeticId"), CosmeticSchema),
  /** Wardrobe slots and subcategories retain the game's menu order. */
  cosmeticSlots: v.record(cosmeticSlot, CosmeticSlotMetaSchema),
  dates: v.record(id("DateId"), SourcedEntitySchema),
  festivals: v.record(id("FestivalId"), FestivalSchema),
  items: v.record(id("ItemId"), ItemSchema),
  mines: v.strictObject({
    biomes: v.array(MinesBiomeSchema),
    spells: v.record(id("SpellId"), TrackerEntitySchema),
  }),
  mount: MountSchema,
  museum: v.record(id("MuseumWingId"), MuseumWingSchema),
  perkTierLevels: v.strictTuple([number, number, number, number, number]),
  pets: v.strictObject({
    cosmetics: v.record(id("PetCosmeticSetId"), SourcedEntitySchema),
    skins: v.record(id("PetSkinId"), SourcedEntitySchema),
  }),
  pregnancyQuestByVillager: v.record(id("VillagerId"), v.optional(id("QuestId"))),
  questOrder: v.record(questType, v.array(id("QuestId"))),
  quests: v.strictObject({
    cooking: v.record(id("QuestId"), CookingQuestSchema),
    crown: v.record(id("QuestId"), TrackerEntitySchema),
    fetch: v.record(id("QuestId"), FetchQuestSchema),
    heart: v.record(id("QuestId"), HeartQuestSchema),
    mission: v.record(id("QuestId"), TrackerEntitySchema),
    story: v.record(id("QuestId"), StoryQuestSchema),
  }),
  recipes: v.record(id("RecipeId"), SourcedEntitySchema),
  skills: v.record(id("SkillId"), SkillSchema),
  stores: v.record(id("StoreId"), StoreSchema),
  townRanks: v.array(TownRankSchema),
  treasureChestTiers: v.record(id("TreasureChestTierId"), emptyEntry),
  version: v.string(),
  villagers: v.record(id("VillagerId"), VillagerSchema),
});
