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

export interface AlmanacCategory {
  items: AlmanacEntry[];
  name: string;
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
  slot: CosmeticSlot;
  subCategory?: string;
}
export type CosmeticId = string & { readonly __brand: "CosmeticId" };
export type CosmeticSlot =
  | "back"
  | "dress"
  | "eyes"
  | "face"
  | "facial"
  | "hair"
  | "head"
  | "overalls"
  | "pants"
  | "robe"
  | "shirt"
  | "shoes"
  | "shorts"
  | "skirt"
  | "suit"
  | "top"
  | "underwear";
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
  npc: NpcId;
  rewardRecipeId?: RecipeId;
}
export interface HeartLevelChange {
  level: number;
  npcId: NpcId;
}
export interface HeartQuest extends Quest {
  heartLevel: number;
  npc: NpcId;
}
export interface Item extends TrackerEntity {
  category: string;
  iconSprite: string;
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
/**
 * Player-facing NPC names are deliberately absent: they live in the per-locale `npcs` chunks and
 * are resolved through `getName("npcs", id, locale)`. A `name` field that doesn't exist on the
 * type is the guardrail against rendering untranslated data.
 */
export interface Npc {
  birthday: Day;
  dateable?: true;
  smallIconSprite?: string;
  visibility?: VisibilityCondition;
}
export type NpcId = string & { readonly __brand: "NpcId" };
export type NpcRelationship = "married" | "platonic" | "proposed" | "romantic" | "undecided";
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
export type Season = "fall" | "spring" | "summer" | "winter";
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
  dates: Record<DateId, DateType>;
  festivals: Record<FestivalId, Festival>;
  generatedAt: string;
  items: Record<ItemId, Item>;
  mines: {
    biomes: MinesBiome[];
    spells: Record<SpellId, Spell>;
  };
  museum: Record<MuseumWingId, MuseumWing>;
  npcs: Record<NpcId, Npc>;
  perkTierLevels: [number, number, number, number, number];
  pets: {
    cosmetics: Record<PetCosmeticSetId, PetCosmeticSet>;
    skins: Record<PetSkinId, PetSkin>;
  };
  pregnancyQuestByNpc: Partial<Record<NpcId, QuestId>>;
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
}
export interface TrackerEntity {
  sources: SourceTuple;
  visibility?: VisibilityCondition;
}
export type TreasureChestTierId = string & { readonly __brand: "TreasureChestTier" };
export type Weather = "calm" | "heavy_inclement" | "inclement" | "special";
