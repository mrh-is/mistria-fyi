/**
 * The player's recorded progress & the results of merging a save into it. These are domain types
 * shared by the engine, the store, & the UI; the store owns the mutable instance.
 */

import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  ItemId,
  MountAppearanceId,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
  QuestId,
  RecipeId,
  Season,
  SkillId,
  SpellId,
  VillagerId,
  VillagerRelationship,
} from "./tracker-data.js";

/** Version stamped on every persisted progress blob; the browser suites build fixtures from it. */
export const CURRENT_SERIALIZATION_VERSION = 2;
export const CHILD_CHOICES = ["no", "undeclared", "yes"] as const;
export const QUEST_STATES = ["completed", "none", "obtained"] as const;
export type ChildChoice = (typeof CHILD_CHOICES)[number];
export interface ProgressState {
  almanac: Set<ItemId>;
  almanacRecipes: Set<RecipeId>;
  animalCosmetics: Partial<Record<AnimalId, Set<CosmeticId>>>;
  animals: Partial<Record<AnimalId, Set<AnimalVariantId>>>;
  childChoice: ChildChoice;
  cosmetics: Set<CosmeticId>;
  hasUpperFloor: boolean;
  heartLevels: Partial<Record<VillagerId, number>>;
  mineFloor: number;
  mountAppearances: Set<MountAppearanceId>;
  museum: Set<ItemId>;
  petCosmetics: Set<PetCosmeticSetId>;
  petSkins: Set<PetSkinId>;
  questStates: Partial<Record<QuestId, QuestState>>;
  reachedSeason: Season;
  renown: number;
  skillLevels: Partial<Record<SkillId, number>>;
  /** Player spells, unlocked through mine progression but usable anywhere. */
  spells: Set<SpellId>;
  unlockedPerks: Set<PerkId>;
  villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>>;
}

/**
 * A household fact (spouse identity or child choice) that a merge could not apply because it
 * conflicts with locally recorded progress. The merge keeps the local value and reports the
 * conflict rather than guessing; see docs on `mergeFromSave` for the policy.
 */
export type MergeConflict =
  | {
      incomingChildChoice: Exclude<ChildChoice, "undeclared">;
      kind: "childChoice";
      localChildChoice: Exclude<ChildChoice, "undeclared">;
      villagerId: VillagerId;
    }
  | {
      incomingRelationship: VillagerRelationship;
      kind: "relationship";
      localRelationship: VillagerRelationship;
      villagerId: VillagerId;
    }
  | {
      incomingVillagerId: VillagerId;
      kind: "spouse";
      localVillagerId: VillagerId;
    };

export interface MergeCounts {
  almanac: number;
  almanacRecipes: number;
  animalCosmetics: number;
  animals: number;
  childChoice: number;
  cosmetics: number;
  hasUpperFloor: number;
  heartLevels: number;
  mineFloor: number;
  mountAppearances: number;
  museum: number;
  perks: number;
  petCosmetics: number;
  petSkins: number;
  quests: number;
  reachedSeason: number;
  renown: number;
  skillLevels: number;
  spells: number;
  villagerRelationships: number;
}

/** What the store’s `mergeFromSave` applied and what it skipped rather than guessing. */
export interface MergeResult {
  conflicts: MergeConflict[];
  counts: MergeCounts;
}

export type QuestState = (typeof QUEST_STATES)[number];
