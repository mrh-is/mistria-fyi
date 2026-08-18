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

// ─── Branded ID types ───────────────────────────────────────────────
// Nominal typing for string IDs to prevent accidental mixing

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
export type BiomeId = string & { readonly __brand: "BiomeId" };
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
export type FestivalId = string & { readonly __brand: "FestivalId" };
export interface Item extends TrackerEntity {
  category: string;
  name: string;
  questGate?: QuestId[];
  recipeId?: RecipeId;
}
export type ItemId = string & { readonly __brand: "ItemId" };
export interface MuseumWing {
  id: WingId;
  name: string;
  sets: { id: SetId; items: ItemId[]; name: string }[];
}

export type NpcId = string & { readonly __brand: "NpcId" };

export type PerkId = string & { readonly __brand: "PerkId" };

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
export type SetId = string & { readonly __brand: "SetId" };

export type SkillId = string & { readonly __brand: "SkillId" };

export type SpellId = string & { readonly __brand: "SpellId" };
export type StoreId = string & { readonly __brand: "StoreId" };

export interface TrackerData {
  almanac: AlmanacCategory[];

  animals: Record<AnimalId, Animal>;

  categoryVisibility: Record<string, VisibilityCondition>;

  cosmetics: Record<CosmeticId, Cosmetic>;

  festivals: Record<FestivalId, { date: { day: number; season: Season }; name: string }>;

  generatedAt: string;

  heartLevelChanges: Record<QuestId, { level: number; npcId: NpcId }[]>;

  items: Record<ItemId, Item>;

  mines: {
    biomes: {
      endFloor: number;
      id: BiomeId;
      name: string;
      startFloor: number;
    }[];
    maxFloors: number;
    spells: Record<
      SpellId,
      { name: string; questGate?: QuestId[]; visibility?: VisibilityCondition }
    >;
  };

  museum: MuseumWing[];

  npcs: Record<
    NpcId,
    {
      birthday: { day: number; season: Season };
      dateable: boolean;
      name: string;
    }
  >;

  npcVisibility: Record<NpcId, VisibilityCondition>;

  perks: Record<
    PerkId,
    { name: string; skillId: SkillId; tier: number; visibility?: VisibilityCondition }
  >;

  perkTierLevels: number[];

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

  quests: Record<
    string,
    Record<QuestId, { name: string; npc?: string; visibility?: VisibilityCondition }>
  >;

  recipes: Record<RecipeId, Recipe>;

  renown: {
    levelsPerRank: number;
    ranks: { name: string }[];
  };

  skills: Record<SkillId, string>;
  stores: Record<StoreId, { article?: "the"; name: string; upgradeAction?: string }>;
  storeVisibility: Record<StoreId, VisibilityCondition>;
  treasureChestTiers: Record<TreasureChestTier, { name: string }>;

  version: string;
}

export interface TrackerEntity {
  sources?: AcquisitionSource[];
  visibility?: VisibilityCondition;
}

export type TreasureChestTier = string & { readonly __brand: "TreasureChestTier" };

export type Weather = "calm" | "heavy_inclement" | "inclement" | "special";

export type WingId = string & { readonly __brand: "WingId" };
