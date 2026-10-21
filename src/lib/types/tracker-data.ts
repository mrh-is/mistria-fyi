import type * as v from "valibot";

import type * as schemas from "./tracker-data-schema.js";

export type {
  ActivityId,
  AvailabilityCondition,
  JsonValue,
  LocationId,
  MonsterId,
  ProductionMethod,
  Source,
  StationId,
  WaterType,
} from "./acquisition.js";

export type AlmanacCategoryId = string & v.Brand<"AlmanacCategoryId">;
export type AnimalId = string & v.Brand<"AnimalId">;
export type AnimalVariantId = string & v.Brand<"AnimalVariantId">;
export type CosmeticId = string & v.Brand<"CosmeticId">;
export type DateId = string & v.Brand<"DateId">;
export type FestivalId = string & v.Brand<"FestivalId">;
export type ItemId = string & v.Brand<"ItemId">;
export type MinesBiomeId = string & v.Brand<"MinesBiomeId">;
export type MountAppearanceId = string & v.Brand<"MountAppearanceId">;
export type MuseumWingId = string & v.Brand<"MuseumWingId">;
export type MuseumWingSetId = string & v.Brand<"MuseumWingSetId">;
export type PerkId = string & v.Brand<"PerkId">;
export type PetCosmeticSetId = string & v.Brand<"PetCosmeticSetId">;
export type PetSkinId = string & v.Brand<"PetSkinId">;
export type QuestId = string & v.Brand<"QuestId">;
export type RecipeId = string & v.Brand<"RecipeId">;
export type SkillId = string & v.Brand<"SkillId">;
export type SpellId = string & v.Brand<"SpellId">;
export type StoreId = string & v.Brand<"StoreId">;
export type TreasureChestTierId = string & v.Brand<"TreasureChestTierId">;
export type VillagerId = string & v.Brand<"VillagerId">;
export type AnyId = string & v.Brand<string>;

/** Schemas are imported only as types: generated data is validated by the pipeline. */
export type AlmanacCategory = v.InferOutput<typeof schemas.AlmanacCategorySchema>;
export type AlmanacEntry = v.InferOutput<typeof schemas.AlmanacEntrySchema>;
export type Animal = v.InferOutput<typeof schemas.AnimalSchema>;
export type AnimalVariant = v.InferOutput<typeof schemas.AnimalVariantSchema>;
export type AnimalVariantTier = v.InferOutput<typeof schemas.AnimalVariantTierSchema>;
export type Cosmetic = v.InferOutput<typeof schemas.CosmeticSchema>;
export type CosmeticSlotMeta = v.InferOutput<typeof schemas.CosmeticSlotMetaSchema>;
export type Item = v.InferOutput<typeof schemas.ItemSchema>;
export type MinesBiome = v.InferOutput<typeof schemas.MinesBiomeSchema>;
export type Mount = v.InferOutput<typeof schemas.MountSchema>;
export type MuseumWing = v.InferOutput<typeof schemas.MuseumWingSchema>;
export type MuseumWingSet = v.InferOutput<typeof schemas.MuseumWingSetSchema>;
export type PerkTier = v.InferOutput<typeof schemas.PerkTierSchema>;
export type Skill = v.InferOutput<typeof schemas.SkillSchema>;
export type SourcedEntity = v.InferOutput<typeof schemas.SourcedEntitySchema>;
export type StoryQuest = v.InferOutput<typeof schemas.StoryQuestSchema>;
export type TownRank = v.InferOutput<typeof schemas.TownRankSchema>;
export type TrackerData = v.InferOutput<typeof schemas.TrackerDataSchema>;
export type TrackerEntity = v.InferOutput<typeof schemas.TrackerEntitySchema>;
export type Villager = v.InferOutput<typeof schemas.VillagerSchema>;
export type AnimalCosmetic = SourcedEntity;
export type CosmeticSlot = Cosmetic["slot"];
export type VillagerDate = SourcedEntity;
/** The Mistmare's ride-able skins; names live in the mount locale chunk. */
export type MountAppearance = SourcedEntity;
export type PetCosmeticSet = SourcedEntity;
export type PetSkin = SourcedEntity;
export type QuestType = keyof TrackerData["quests"];
export type Recipe = SourcedEntity;
export type Spell = TrackerEntity;
/** A chest tier carries no data; its name lives in locale files. */
export type TreasureChestTier = TrackerData["treasureChestTiers"][TreasureChestTierId];

export const SEASONS = ["fall", "spring", "summer", "winter"] as const;
export type Season = (typeof SEASONS)[number];
export const STORE_UPGRADE_ACTIONS = ["repair"] as const;
export type StoreUpgradeAction = (typeof STORE_UPGRADE_ACTIONS)[number];
export const VILLAGER_RELATIONSHIPS = [
  "married",
  "platonic",
  "proposed",
  "romantic",
  "undecided",
] as const;
export const WEATHERS = ["calm", "heavy_inclement", "inclement", "special"] as const;
export type VillagerRelationship = (typeof VILLAGER_RELATIONSHIPS)[number];
export type Weather = (typeof WEATHERS)[number];
