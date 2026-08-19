import type { Source as AcquisitionSource, Source } from "./acquisition.js";
import type { VisibilityCondition } from "./visibility.js";

export type { AcquisitionSource };
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
  SourceDetails,
  SourceTuple,
  StationId,
  WaterType,
} from "./acquisition.js";

export interface AlmanacCategory {
  id: string;
  items: ItemId[];
  name: string;
}
export interface Animal {
  cosmetics: Record<CosmeticId, AnimalCosmetic>;
  name: string;
  questGate?: QuestId[];
  variantTiers: AnimalVariantTier[];
  visibility?: VisibilityCondition;
}
export interface AnimalCosmetic {
  fullName: string;
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
  endFloor: number;
  id: MinesBiomeId;
  name: string;
  startFloor: number;
}
export type MinesBiomeId = string & { readonly __brand: "BiomeId" };
export interface MuseumWing {
  id: WingId;
  name: string;
  sets: MuseumWingSet[];
}
export interface MuseumWingSet {
  id: MuseumWingSetId;
  items: ItemId[];
  name: string;
}
export type MuseumWingSetId = string & { readonly __brand: "SetId" };
export interface Npc {
  birthday: Day;
  dateable: boolean;
  name: string;
}
export type NpcId = string & { readonly __brand: "NpcId" };
export interface Perk {
  name: string;
}
export type PerkId = string & { readonly __brand: "PerkId" };
export type PerkTier = Record<PerkId, Perk>;
export interface Quest extends TrackerEntity {
  heartLevelChanges?: HeartLevelChange[];
  name: string;
  npc?: NpcId;
}
export type QuestId = string & { readonly __brand: "QuestId" };
export type QuestType = string & { readonly __brand: "QuestType" };
export interface Recipe extends TrackerEntity {
  memberItemIds: ItemId[];
  presentations: RecipePresentation[];
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
}
export type StoreId = string & { readonly __brand: "StoreId" };
export interface TrackerData {
  almanac: AlmanacCategory[];
  animals: Record<AnimalId, Animal>;
  categoryVisibility: Partial<Record<string, VisibilityCondition>>;
  cosmetics: Record<CosmeticId, Cosmetic>;
  festivals: Record<FestivalId, Festival>;
  generatedAt: string;
  items: Record<ItemId, Item>;
  mines: {
    biomes: MinesBiome[];
    maxFloors: number;
    spells: Record<SpellId, Spell>;
  };
  museum: MuseumWing[];
  npcs: Record<NpcId, Npc>;
  npcVisibility: Record<NpcId, VisibilityCondition>;
  perkTierLevels: [number, number, number, number, number];
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
  quests: Record<QuestType, Record<QuestId, Quest>>;
  recipes: Record<RecipeId, Recipe>;
  renown: {
    levelsPerRank: number;
    ranks: { name: string }[];
  };
  skills: Record<SkillId, Skill>;
  stores: Record<StoreId, Store>;
  storeVisibility: Record<StoreId, VisibilityCondition>;
  treasureChestTiers: Record<TreasureChestTierId, { name: string }>;
  version: string;
}
export interface TrackerEntity {
  sources?: AcquisitionSource[];
  visibility?: VisibilityCondition;
}
export type TreasureChestTierId = string & { readonly __brand: "TreasureChestTier" };
export type Weather = "calm" | "heavy_inclement" | "inclement" | "special";
export type WingId = string & { readonly __brand: "WingId" };
