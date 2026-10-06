import type { Season } from "#lib/types/tracker-data.js";
import type { MergeCounts, QuestState } from "#lib/types/user-progress.js";

/** Seasons in calendar order. `SEASONS` in the data contract is alphabetical. */
export const SEASON_ORDER: readonly Season[] = ["spring", "summer", "fall", "winter"];

const QUEST_STATE_RANK: Record<QuestState, number> = { completed: 2, none: 0, obtained: 1 };

/** A zeroed counter set, one fresh object per call. */
export function emptyMergeCounts(): MergeCounts {
  return {
    almanac: 0,
    almanacRecipes: 0,
    animalCosmetics: 0,
    animals: 0,
    childChoice: 0,
    cosmetics: 0,
    dates: 0,
    hasUpperFloor: 0,
    heartLevels: 0,
    mineFloor: 0,
    museum: 0,
    perks: 0,
    petCosmetics: 0,
    petSkins: 0,
    quests: 0,
    reachedSeason: 0,
    renown: 0,
    skillLevels: 0,
    spells: 0,
    villagerRelationships: 0,
  };
}

/** The next state when cycling a quest: none, obtained, completed, then back to none. */
export function nextQuestState(current: QuestState): QuestState {
  if (current === "none") return "obtained";
  return current === "obtained" ? "completed" : "none";
}

/** Higher ranks are further along; merges keep the higher-ranked state. */
export function questStateRank(state: QuestState): number {
  return QUEST_STATE_RANK[state];
}

/** The season at a calendar position (0 spring through 3 winter). */
export function seasonFromOrdinal(ordinal: number): Season {
  return SEASON_ORDER[ordinal];
}

/** Calendar position of a season (0 spring through 3 winter). */
export function seasonOrdinal(season: Season): number {
  return SEASON_ORDER.indexOf(season);
}
