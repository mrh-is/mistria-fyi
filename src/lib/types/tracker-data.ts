import type { DateId, Source, SourceTuple } from "./acquisition.js";
import type { VisibilityCondition } from "./visibility.js";

export type {
  ActivityId,
  AvailabilityCondition,
  DateId,
  DialogueChoiceId,
  DungeonLootGroup,
  JsonValue,
  LocationId,
  MonsterId,
  ProductionMethod,
  Source,
  SourceDetails,
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
export type AlmanacCategoryId = string & { readonly __brand: "AlmanacCategoryId" };
export interface AlmanacEntry {
  itemIds: ItemId[];
  recipeId?: RecipeId;
}
export interface Animal {
  cosmetics: Record<CosmeticId, AnimalCosmetic>;
  variantTiers: AnimalVariantTier[];
  visibility?: VisibilityCondition;
}
export type AnimalCosmetic = TrackerEntity;
export type AnimalId = string & { readonly __brand: "AnimalId" };
export interface AnimalVariant {
  source: Extract<Source, { type: "breed" | "default" }>;
}
export type AnimalVariantId = string & { readonly __brand: "VariantId" };
export type AnimalVariantTier = Record<AnimalVariantId, AnimalVariant>;
export type AnyId = string & { readonly __brand: string };
export interface CookingQuest extends Quest {
  recipeId: RecipeId;
}
export interface Cosmetic extends TrackerEntity {
  /** A `ui/character_customization.toml` section; the wardrobe menu's slot. */
  slot: CosmeticSlot;
  /** A `ui_sub_category` key; its label resolves via `getName("cosmetics/subcategories", key, locale)`. */
  subCategory: string;
}
export type CosmeticId = string & { readonly __brand: "CosmeticId" };
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
export type DateType = TrackerEntity;
export interface Day {
  day: number;
  season: Season;
}
export interface Festival {
  date: Day;
}
export type FestivalId = string & { readonly __brand: "FestivalId" };
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
export interface Item extends TrackerEntity {
  category: string;
}
export type ItemId = string & { readonly __brand: "ItemId" };
export interface MinesBiome {
  floors: Range;
  id: MinesBiomeId;
}
export type MinesBiomeId = string & { readonly __brand: "BiomeId" };
export interface MuseumWing {
  sets: Record<MuseumWingSetId, MuseumWingSet>;
}
export type MuseumWingId = string & { readonly __brand: "WingId" };
export interface MuseumWingSet {
  items: ItemId[];
}
export type MuseumWingSetId = string & { readonly __brand: "SetId" };
export type Perk = object;
export type PerkId = string & { readonly __brand: "PerkId" };
export type PerkTier = Record<PerkId, Perk>;
export type PetCosmeticSet = TrackerEntity;
export type PetCosmeticSetId = string & { readonly __brand: "PetCosmeticSetId" };
export type PetSkin = TrackerEntity;
export type PetSkinId = string & { readonly __brand: "PetSkinId" };
export type Quest = TrackerEntity;
export type QuestId = string & { readonly __brand: "QuestId" };
export interface QuestOverrides {
  cooking: CookingQuest;
  fetch: FetchQuest;
  heart: HeartQuest;
  story: StoryQuest;
}
export type QuestType = "cooking" | "crown" | "fetch" | "heart" | "mission" | "story";
export type QuestTypeMap = {
  [K in QuestType]: K extends keyof QuestOverrides ? QuestOverrides[K] : Quest;
};
export interface Range {
  end: number;
  start: number;
}
export type Recipe = TrackerEntity;
export type RecipeId = string & { readonly __brand: "RecipeId" };
export const SEASONS = ["fall", "spring", "summer", "winter"] as const;
export type Season = (typeof SEASONS)[number];
export interface Skill {
  perkTiers: [PerkTier, PerkTier, PerkTier, PerkTier, PerkTier];
}
export type SkillId = string & { readonly __brand: "SkillId" };
export type Spell = TrackerEntity;
export type SpellId = string & { readonly __brand: "SpellId" };
export interface Store {
  article?: "the";
  upgradeAction?: string;
  visibility?: VisibilityCondition;
}
export type StoreId = string & { readonly __brand: "StoreId" };
export interface StoryQuest extends Quest {
  heartLevelChanges?: HeartLevelChange[];
}
export interface TownRank {
  levels: Range;
}
export interface TrackerData {
  almanac: Record<AlmanacCategoryId, AlmanacCategory>;
  animals: Record<AnimalId, Animal>;
  categoryVisibility: Partial<Record<"dates" | QuestType, VisibilityCondition>>;
  cosmetics: Record<CosmeticId, Cosmetic>;
  /** Wardrobe slots in the game's menu order (object key order), including slots with no cosmetics. */
  cosmeticSlots: Record<CosmeticSlot, CosmeticSlotMeta>;
  dates: Record<DateId, DateType>;
  festivals: Record<FestivalId, Festival>;
  generatedAt: string;
  items: Record<ItemId, Item>;
  mines: {
    biomes: MinesBiome[];
    spells: Record<SpellId, Spell>;
  };
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
  treasureChestTiers: Record<TreasureChestTierId, object>;
  version: string;
  villagers: Record<VillagerId, Villager>;
}
export interface TrackerEntity {
  sources: SourceTuple;
  visibility?: VisibilityCondition;
}
export type TreasureChestTierId = string & { readonly __brand: "TreasureChestTier" };
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
export type VillagerId = string & { readonly __brand: "VillagerId" };
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
