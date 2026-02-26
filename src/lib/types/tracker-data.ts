// ─── Branded ID types ───────────────────────────────────────────────
// Nominal typing for string IDs to prevent accidental mixing

export interface AlmanacCategory {
  id: string;
  items: Record<ItemId, { name: string }>;
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
export interface Restriction {
  animal?: string;
  building?: string;
  hours?: [number, number];
  level?: number;
  perk?: string;
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
  | "fishSize"
  | "perk"
  | "randomStock"
  | "season"
  | "seenSeason"
  | "skill"
  | "time"
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

  items: Record<ItemId, { category: string; name: string; questGate?: QuestId[] }>;

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
