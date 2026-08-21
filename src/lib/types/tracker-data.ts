import type { Source, SourceTuple } from "./acquisition.js";
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
  items: ItemId[];
  name: string;
}
export type AlmanacCategoryId = string & { readonly __brand: "AlmanacCategoryId" };
export interface Animal {
  cosmetics: Record<CosmeticId, AnimalCosmetic>;
  name: string;
  questGate?: QuestId[];
  variantTiers: AnimalVariantTier[];
  visibility?: VisibilityCondition;
}
export interface AnimalCosmetic extends TrackerEntity {
  name: string;
}
export type AnimalId = string & { readonly __brand: "AnimalId" };
export interface AnimalVariant {
  name: string;
  source: Extract<Source, { type: "breed" | "default" }>;
}
export type AnimalVariantId = string & { readonly __brand: "VariantId" };
export type AnimalVariantTier = Record<AnimalVariantId, AnimalVariant>;
export type AnyId = string & { readonly __brand: string };
export interface Cosmetic extends TrackerEntity {
  name: string;
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
export interface Day {
  day: number;
  season: Season;
}
export interface Festival {
  date: Day;
  name: string;
}
export type FestivalId = string & { readonly __brand: "FestivalId" };
export interface FetchQuest extends Quest {
  itemId: ItemId;
  npc: NpcId;
}
export interface HeartLevelChange {
  level: number;
  npcId: NpcId;
}
export interface Item extends TrackerEntity {
  category: string;
  name: string;
  questGate?: QuestId[];
}
export type ItemId = string & { readonly __brand: "ItemId" };
export interface MinesBiome {
  floors: Range;
  id: MinesBiomeId;
  name: string;
}
export type MinesBiomeId = string & { readonly __brand: "BiomeId" };
export interface MuseumWing {
  name: string;
  sets: Record<MuseumWingSetId, MuseumWingSet>;
}
export type MuseumWingId = string & { readonly __brand: "WingId" };
export interface MuseumWingSet {
  items: ItemId[];
  name: string;
}
export type MuseumWingSetId = string & { readonly __brand: "SetId" };
export interface Npc {
  birthday: Day;
  dateable?: true;
  name: string;
  visibility?: VisibilityCondition;
}
export type NpcId = string & { readonly __brand: "NpcId" };
export interface Perk {
  name: string;
}
export type PerkId = string & { readonly __brand: "PerkId" };
export type PerkTier = Record<PerkId, Perk>;
export interface PetCosmeticSet extends TrackerEntity {
  name: string;
}
export type PetCosmeticSetId = string & { readonly __brand: "PetCosmeticSetId" };
export interface PetSkin extends TrackerEntity {
  name: string;
}
export type PetSkinId = string & { readonly __brand: "PetSkinId" };
export interface Quest extends TrackerEntity {
  name: string;
}
export type QuestId = string & { readonly __brand: "QuestId" };
export interface QuestOverrides {
  fetch: FetchQuest;
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
export interface Recipe extends TrackerEntity {
  name: string;
}
export type RecipeId = string & { readonly __brand: "RecipeId" };
export interface RecipePresentation {
  itemIds: ItemId[];
  name: string;
}
export type Season = "fall" | "spring" | "summer" | "winter";
export interface Skill {
  name: string;
  perkTiers: [PerkTier, PerkTier, PerkTier, PerkTier, PerkTier];
}
export type SkillId = string & { readonly __brand: "SkillId" };
export interface Spell extends TrackerEntity {
  name: string;
}
export type SpellId = string & { readonly __brand: "SpellId" };
export interface Store {
  article?: "the";
  name: string;
  upgradeAction?: string;
  visibility?: VisibilityCondition;
}
export type StoreId = string & { readonly __brand: "StoreId" };
export interface StoryQuest extends Quest {
  heartLevelChanges?: HeartLevelChange[];
}
export interface TownRank {
  levels: Range;
  name: string;
}
export interface TrackerData {
  almanac: Record<AlmanacCategoryId, AlmanacCategory>;
  animals: Record<AnimalId, Animal>;
  categoryVisibility: Partial<Record<QuestType, VisibilityCondition>>;
  cosmetics: Record<CosmeticId, Cosmetic>;
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
  questChains: {
    crown: QuestId[];
    fetch: Record<QuestId, VisibilityCondition>;
    heart: Record<NpcId, { heartLevel: number; prerequisiteQuest?: QuestId; questId: QuestId }[]>;
    stillwell: QuestId[];
    story: Record<QuestId, { prerequisites: QuestId[] }>;
    tali: QuestId[];
  };
  questGates: {
    animalGates: Record<AnimalId, QuestId[]>;
    itemGates: Record<ItemId, QuestId[]>;
    progressionFlagToQuests: Record<string, QuestId[]>;
    spellGates: Record<SpellId, QuestId[]>;
  };
  quests: {
    [K in QuestType]: Record<QuestId, QuestTypeMap[K]>;
  };
  recipes: Record<RecipeId, Recipe>;
  skills: Record<SkillId, Skill>;
  stores: Record<StoreId, Store>;
  townRanks: TownRank[];
  treasureChestTiers: Record<TreasureChestTierId, { name: string }>;
  version: string;
}
export interface TrackerEntity {
  sources: SourceTuple;
  visibility?: VisibilityCondition;
}
export type TreasureChestTierId = string & { readonly __brand: "TreasureChestTier" };
export type Weather = "calm" | "heavy_inclement" | "inclement" | "special";
