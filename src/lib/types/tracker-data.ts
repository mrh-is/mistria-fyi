import type { VisibilityCondition } from "./visibility.js";

export type {
  Source as AcquisitionSource,
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
  items: Record<
    ItemId,
    { colorCount?: number; name: string; recipeId?: RecipeId; visibility?: VisibilityCondition }
  >;
  name: string;
}
export type AnimalId = string & { readonly __brand: "AnimalId" };
export type BiomeId = string & { readonly __brand: "BiomeId" };
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
export type ItemId = string & { readonly __brand: "ItemId" };
export interface LegacyItemSource {
  location?: string;
  restrictions?: Restriction[];
  type: SourceType;
}
export type LegacyRecipeSource = (
  | { biomeId: BiomeId; perkId: PerkId; type: "mines_chest"; visibility?: VisibilityCondition }
  | { biomeId: BiomeId; perkId: PerkId; type: "mines_dig_site"; visibility?: VisibilityCondition }
  | {
      bundleName: string;
      storeId: StoreId;
      type: "scroll_bundle";
      visibility?: VisibilityCondition;
    }
  | {
      challengeRecipeId?: RecipeId;
      questId: QuestId;
      questType: QuestType;
      requestedItemId?: ItemId;
      type: "quest";
      visibility?: VisibilityCondition;
    }
  | { cost: number; type: "chicken_statue"; visibility?: VisibilityCondition }
  | { cost: number; type: "wishing_well"; visibility?: VisibilityCondition }
  | { festivalId: FestivalId; storeId: StoreId; type: "festival"; visibility?: VisibilityCondition }
  | { level: number; type: "renown"; visibility?: VisibilityCondition }
  | { perkId: PerkId; storeId: StoreId; type: "store_with_perk"; visibility?: VisibilityCondition }
  | { perkId: PerkId; type: "perk"; visibility?: VisibilityCondition }
  | { setCount: number; type: "museum_donation"; visibility?: VisibilityCondition; wingId: WingId }
  | { storeId: StoreId; type: "store"; upgraded?: true; visibility?: VisibilityCondition }
  | { storeId: StoreId; type: "upgrade"; upgradeName: string; visibility?: VisibilityCondition }
  | { tier: TreasureChestTier; type: "treasure_chest"; visibility?: VisibilityCondition }
  | {
      trigger: "donated_item";
      triggerItemId: ItemId;
      type: "letter";
      visibility?: VisibilityCondition;
    }
  | {
      trigger: "reached_date";
      triggerDate: { day: number; season: Season; year?: number };
      type: "letter";
      visibility?: VisibilityCondition;
    }
  | {
      trigger: "shipped_item";
      triggerItemId: ItemId;
      type: "letter";
      visibility?: VisibilityCondition;
    }
  | { type: "beach_cave_chest"; visibility?: VisibilityCondition }
  | { type: "default"; visibility?: VisibilityCondition }
  | { type: "dragon_forge"; visibility?: VisibilityCondition }
  | { type: "engagement"; visibility?: VisibilityCondition }
) & { restrictions?: Restriction[] };
export interface MuseumWing {
  id: WingId;
  name: string;
  sets: { id: SetId; items: ItemId[]; name: string }[];
}
export type NpcId = string & { readonly __brand: "NpcId" };
export type PerkId = string & { readonly __brand: "PerkId" };
export type QuestId = string & { readonly __brand: "QuestId" };
export type QuestType = string & { readonly __brand: "QuestType" };
export interface Recipe {
  memberItemIds: ItemId[];
  presentations: RecipePresentation[];
  sources: LegacyRecipeSource[];
  visibility?: VisibilityCondition;
}
export type RecipeId = string & { readonly __brand: "RecipeId" };
export interface RecipePresentation {
  itemIds: ItemId[];
  name: string;
}
export type RecipeSource = LegacyRecipeSource;
export interface Restriction {
  animal?: string;
  building?: string;
  cutscene?: string;
  hours?: [number, number];
  level?: number;
  perk?: string;
  relationship?: string;
  season?: Season;
  seasons?: Season[];
  size?: string;
  skill?: string;
  type: RestrictionType;
  weathers?: Weather[];
}

// ─── Enums ──────────────────────────────────────────────────────────

export type RestrictionType =
  | "animal"
  | "building"
  | "cutscene"
  | "fishSize"
  | "minesLevel"
  | "perk"
  | "randomStock"
  | "relationship"
  | "season"
  | "seenSeason"
  | "skill"
  | "time"
  | "upperFloor"
  | "weather";
export type Season = "fall" | "spring" | "summer" | "winter";

export type SetId = string & { readonly __brand: "SetId" };
export type SkillId = string & { readonly __brand: "SkillId" };
export type Source = LegacyItemSource;

export type SourceType =
  | "bug_catch"
  | "chest"
  | "cook"
  | "craft"
  | "dig"
  | "dive"
  | "festival"
  | "fish"
  | "forage"
  | "mine"
  | "monster"
  | "quest"
  | "renown"
  | "sapling"
  | "seed"
  | "store";

export type SpellId = string & { readonly __brand: "SpellId" };

export type StoreId = string & { readonly __brand: "StoreId" };
export interface TrackerData {
  almanac: AlmanacCategory[];
  animals: Record<
    AnimalId,
    {
      cosmetics: Record<CosmeticId, { fullName: string; name: string }>;
      name: string;
      questGate?: QuestId[];
      variants: Record<
        VariantId,
        {
          bornIn?: Season;
          defaultUnlocked: boolean;
          name: string;
          tier?: number;
        }
      >;
      visibility?: VisibilityCondition;
    }
  >;

  categoryVisibility: Record<string, VisibilityCondition>;

  cosmetics: Record<
    CosmeticId,
    {
      defaultUnlocked: boolean;
      name: string;
      slot: CosmeticSlot;
      subCategory?: string;
      visibility?: VisibilityCondition;
    }
  >;

  festivals: Record<FestivalId, { date: { day: number; season: Season }; name: string }>;

  generatedAt: string;

  heartLevelChanges: Record<QuestId, { level: number; npcId: NpcId }[]>;

  items: Record<
    ItemId,
    {
      category: string;
      name: string;
      questGate?: QuestId[];
      recipeId?: RecipeId;
      visibility?: VisibilityCondition;
    }
  >;

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
  sources: Record<ItemId, Source[]>;
  stores: Record<StoreId, { article?: "the"; name: string; upgradeAction?: string }>;
  storeVisibility: Record<StoreId, VisibilityCondition>;
  treasureChestTiers: Record<TreasureChestTier, { name: string }>;

  version: string;
}

export type TreasureChestTier = string & { readonly __brand: "TreasureChestTier" };

// ─── Restriction ────────────────────────────────────────────────────

export type VariantId = string & { readonly __brand: "VariantId" };

// ─── Source ──────────────────────────────────────────────────────────

export type Weather = "calm" | "heavy_inclement" | "inclement" | "special";

// ─── TrackerData (top-level schema) ─────────────────────────────────

export type WingId = string & { readonly __brand: "WingId" };
