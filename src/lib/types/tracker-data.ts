// ─── Branded ID types ───────────────────────────────────────────────
// Nominal typing for string IDs to prevent accidental mixing

export interface AlmanacCategory {
  id: string;
  items: Record<ItemId, { colorCount?: number; name: string; recipeId?: RecipeId }>;
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
export type ItemId = string & { readonly __brand: "ItemId" };
export interface MuseumWing {
  id: WingId;
  name: string;
  sets: { id: SetId; items: ItemId[]; name: string }[];
}
export type NpcId = string & { readonly __brand: "NpcId" };
export type QuestId = string & { readonly __brand: "QuestId" };
export interface Recipe {
  memberItemIds: ItemId[];
  presentations: RecipePresentation[];
  sources: RecipeSource[];
}
export type RecipeId = string & { readonly __brand: "RecipeId" };
export interface RecipePresentation {
  itemIds: ItemId[];
  name: string;
}
export type RecipeSource =
  | { type: "beach_cave_chest" }
  | { type: "default" }
  | { type: "dragon_forge" }
  | { type: "relationship" }
  | { type: "dungeon_chest"; biomeId: BiomeId; perk: string }
  | { type: "chicken_statue"; tier: "large" | "small" }
  | { type: "festival"; festivalId: string; storeId: string }
  | { type: "letter"; trigger: "donated_item" | "shipped_item"; triggerItemId: ItemId }
  | { type: "letter"; trigger: "reached_date" }
  | { type: "museum_donation"; setCount: number; wingId: WingId }
  | { type: "perk"; perk: string }
  | { type: "quest"; questId: QuestId; questType: string }
  | { type: "renown"; level: number }
  | { type: "scroll_bundle"; bundleName: string; storeId: string }
  | { type: "store"; storeId: string }
  | { type: "treasure_chest"; chestTier: string }
  | { type: "upgrade"; upgradeName: string }
  | { type: "wishing_well"; tier: "large" | "small" };
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

// ─── Enums ──────────────────────────────────────────────────────────

export type Season = "fall" | "spring" | "summer" | "winter";
export type SetId = string & { readonly __brand: "SetId" };

export type SkillId = string & { readonly __brand: "SkillId" };

export interface Source {
  location?: string;
  restrictions?: Restriction[];
  type: SourceType;
}

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
    }
  >;

  cosmetics: Record<
    CosmeticId,
    {
      defaultUnlocked: boolean;
      name: string;
      slot: CosmeticSlot;
      subCategory?: string;
    }
  >;

  generatedAt: string;

  items: Record<
    ItemId,
    { category: string; name: string; questGate?: QuestId[]; recipeId?: RecipeId }
  >;

  mines: {
    biomes: {
      endFloor: number;
      id: BiomeId;
      name: string;
      startFloor: number;
    }[];
    maxFloors: number;
    spells: Record<SpellId, { name: string; questGate?: QuestId[] }>;
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

  questGates: {
    animalGates: Record<AnimalId, QuestId[]>;
    itemGates: Record<ItemId, QuestId[]>;
    progressionFlagToQuests: Record<string, QuestId[]>;
    spellGates: Record<SpellId, QuestId[]>;
  };

  quests: Record<string, Record<QuestId, { name: string; npc?: string }>>;

  recipes: Record<RecipeId, Recipe>;

  renown: {
    levelsPerRank: number;
    ranks: { name: string }[];
  };

  skills: Record<SkillId, string>;

  sources: Record<ItemId, Source[]>;

  version: string;
}

// ─── Restriction ────────────────────────────────────────────────────

export type VariantId = string & { readonly __brand: "VariantId" };

// ─── Source ──────────────────────────────────────────────────────────

export type Weather = "calm" | "heavy_inclement" | "inclement" | "special";

// ─── TrackerData (top-level schema) ─────────────────────────────────

export type WingId = string & { readonly __brand: "WingId" };
