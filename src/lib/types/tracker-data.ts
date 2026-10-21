import type * as v from "valibot";

import type { Source, SourceTuple } from "./acquisition.js";
import type { VisibilityCondition } from "./visibility.js";

export type {
  ActivityId,
  AvailabilityCondition,
  JsonValue,
  LocationId,
  MonsterId,
  ProductionMethod,
  Source,
  SourceTuple,
  StationId,
  WaterType,
} from "./acquisition.js";

/**
 * The category's label is the game's own UI string, resolved through `getName("ui", id, locale)`,
 * so no `name` is stored here.
 */
export interface AlmanacCategory {
  items: AlmanacEntry[];
}
export type AlmanacCategoryId = string & v.Brand<"AlmanacCategoryId">;
export interface AlmanacEntry {
  itemIds: ItemId[];
  recipeId?: RecipeId;
}
export interface Animal {
  cosmetics: Record<CosmeticId, AnimalCosmetic>;
  variantTiers: AnimalVariantTier[];
  visibility?: VisibilityCondition;
}
export type AnimalCosmetic = SourcedEntity;
export type AnimalId = string & v.Brand<"AnimalId">;
export interface AnimalVariant {
  source: Extract<Source, { type: "breed" | "default" }>;
}
export type AnimalVariantId = string & v.Brand<"AnimalVariantId">;
export type AnimalVariantTier = Record<AnimalVariantId, AnimalVariant>;
export type AnyId = string & v.Brand<string>;
export interface CookingQuest extends Quest {
  recipeId: RecipeId;
}
export interface Cosmetic extends SourcedEntity {
  /** A `ui/character_customization.toml` section; the wardrobe menu's slot. */
  slot: CosmeticSlot;
  /** A `ui_sub_category` key; its label resolves via `getName("cosmetics/subcategories", key, locale)`. */
  subCategory: string;
}
export type CosmeticId = string & v.Brand<"CosmeticId">;
export type DateId = string & v.Brand<"DateId">;
/** The sections of `ui/character_customization.toml`, verbatim. */
export type CosmeticSlot =
  | "back"
  | "bottom"
  | "eyes"
  | "face_gear"
  | "facial_hair"
  | "feet"
  | "hair"
  | "head_gear"
  | "skin"
  | "top";
export interface CosmeticSlotMeta {
  /** `ui_sub_category` keys in the game's menu order. */
  subCategories: string[];
}
export type VillagerDate = SourcedEntity;
export interface Day {
  day: number;
  season: Season;
}
export interface Festival {
  date: Day;
}
export type FestivalId = string & v.Brand<"FestivalId">;
export interface FetchQuest extends Quest {
  itemId: ItemId;
  rewardRecipeId?: RecipeId;
  villager: VillagerId;
}
export interface HeartLevelChange {
  level: number;
  villagerId: VillagerId;
}
export interface HeartQuest extends Quest {
  heartLevel: number;
  villager: VillagerId;
}
export interface Item extends SourcedEntity {
  category: string;
}
export type ItemId = string & v.Brand<"ItemId">;
export interface MinesBiome {
  floors: LevelRange;
  id: MinesBiomeId;
}
export type MinesBiomeId = string & v.Brand<"MinesBiomeId">;
/** The Mistmare's ride-able skins; names live in the `mount` locale chunk, keyed by ID. */
export interface Mount {
  appearances: Record<MountAppearanceId, MountAppearance>;
}
/** An appearance the player unlocks for the Mistmare, separate from any horse they breed. */
export type MountAppearance = SourcedEntity;
/** A `ranching/animals/horse` variant ID the game reserves for the mount. */
export type MountAppearanceId = string & v.Brand<"MountAppearanceId">;
export interface MuseumWing {
  sets: Record<MuseumWingSetId, MuseumWingSet>;
}
export type MuseumWingId = string & v.Brand<"MuseumWingId">;
export interface MuseumWingSet {
  items: ItemId[];
}
export type MuseumWingSetId = string & v.Brand<"MuseumWingSetId">;
/** A perk's entry carries no data; names live in the locale files, keyed by `PerkId`. */
export type Perk = Record<string, never>;
export type PerkId = string & v.Brand<"PerkId">;
export type PerkTier = Record<PerkId, Perk>;
export type PetCosmeticSet = SourcedEntity;
export type PetCosmeticSetId = string & v.Brand<"PetCosmeticSetId">;
export type PetSkin = SourcedEntity;
export type PetSkinId = string & v.Brand<"PetSkinId">;
/** Quests carry no acquisition sources of their own today, so the list is empty. */
export type Quest = TrackerEntity;
export type QuestId = string & v.Brand<"QuestId">;
export interface QuestTypeSpecializations {
  cooking: CookingQuest;
  fetch: FetchQuest;
  heart: HeartQuest;
  story: StoryQuest;
}
export type QuestType = "cooking" | "crown" | "fetch" | "heart" | "mission" | "story";
export type QuestTypeMap = {
  [K in QuestType]: K extends keyof QuestTypeSpecializations ? QuestTypeSpecializations[K] : Quest;
};
export interface LevelRange {
  end: number;
  start: number;
}
export type Recipe = SourcedEntity;
export type RecipeId = string & v.Brand<"RecipeId">;
export const SEASONS = ["fall", "spring", "summer", "winter"] as const;
export type Season = (typeof SEASONS)[number];
export interface Skill {
  perkTiers: [PerkTier, PerkTier, PerkTier, PerkTier, PerkTier];
}
/** An entity the pipeline guarantees at least one acquisition source for; assembly throws otherwise. */
export interface SourcedEntity extends TrackerEntity {
  sources: SourceTuple;
}
export type SkillId = string & v.Brand<"SkillId">;
/** A spell without a known unlock quest has an empty source list. */
export type Spell = TrackerEntity;
export type SpellId = string & v.Brand<"SpellId">;
export interface Store {
  /** How the store's own upgrade quest is phrased; absent means upgrading. */
  upgradeAction?: StoreUpgradeAction;
  visibility?: VisibilityCondition;
}
export type StoreId = string & v.Brand<"StoreId">;
export const STORE_UPGRADE_ACTIONS = ["repair"] as const;
export type StoreUpgradeAction = (typeof STORE_UPGRADE_ACTIONS)[number];
export interface StoryQuest extends Quest {
  heartLevelChanges?: HeartLevelChange[];
}
export interface TownRank {
  levels: LevelRange;
}
export interface TrackerData {
  almanac: Record<AlmanacCategoryId, AlmanacCategory>;
  animals: Record<AnimalId, Animal>;
  categoryVisibility: Partial<Record<"dates" | QuestType, VisibilityCondition>>;
  cosmetics: Record<CosmeticId, Cosmetic>;
  /** Wardrobe slots in the game's menu order (object key order), including slots with no cosmetics. */
  cosmeticSlots: Record<CosmeticSlot, CosmeticSlotMeta>;
  dates: Record<DateId, VillagerDate>;
  festivals: Record<FestivalId, Festival>;
  items: Record<ItemId, Item>;
  mines: {
    biomes: MinesBiome[];
    spells: Record<SpellId, Spell>;
  };
  mount: Mount;
  museum: Record<MuseumWingId, MuseumWing>;
  perkTierLevels: [number, number, number, number, number];
  pets: {
    cosmetics: Record<PetCosmeticSetId, PetCosmeticSet>;
    skins: Record<PetSkinId, PetSkin>;
  };
  pregnancyQuestByVillager: Partial<Record<VillagerId, QuestId>>;
  questOrder: Partial<Record<QuestType, QuestId[]>>;
  quests: {
    [K in QuestType]: Record<QuestId, QuestTypeMap[K]>;
  };
  recipes: Record<RecipeId, Recipe>;
  skills: Record<SkillId, Skill>;
  stores: Record<StoreId, Store>;
  townRanks: TownRank[];
  treasureChestTiers: Record<TreasureChestTierId, TreasureChestTier>;
  version: string;
  villagers: Record<VillagerId, Villager>;
}
/**
 * An entity whose source list may be empty. Kinds the pipeline guarantees at least one source for
 * use `SourcedEntity` instead, so `sources[0]` is only typed as present when it is.
 */
export interface TrackerEntity {
  sources: Source[];
  visibility?: VisibilityCondition;
}
/** A chest tier's entry carries no data; names live in the locale files, keyed by tier ID. */
export type TreasureChestTier = Record<string, never>;
export type TreasureChestTierId = string & v.Brand<"TreasureChestTierId">;
/**
 * Player-facing villager names are deliberately absent: they live in the per-locale `villagers`
 * chunks and are resolved through `getName("villagers", id, locale)`. A `name` field that doesn't
 * exist on the type is the guardrail against rendering untranslated data.
 */
export interface Villager {
  birthday: Day;
  dateable?: true;
  visibility?: VisibilityCondition;
}
export type VillagerId = string & v.Brand<"VillagerId">;
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
