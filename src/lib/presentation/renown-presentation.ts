import { townRankColor } from "#lib/utils/palette.js";

import type { TownRank } from "#lib/types/tracker-data.js";

export type RankState = "completed" | "current" | "upcoming";

export function getRankState(level: number, rank: TownRank): RankState {
  if (level < rank.levels.start) return "upcoming";
  if (level > rank.levels.end) return "completed";
  return "current";
}

export interface RenownPresentation {
  currentRank: TownRank;
  currentRankIndex: number;
  isMaxed: boolean;
  /** Levels the player has completed inside the current rank. */
  levelsIntoRank: number;
  maxLevel: number;
  overallPercent: number;
  rankColor: string;
  /** How many levels the current rank spans. */
  rankLevelSpan: number;
  rankPercent: number;
}

export function getRenownPresentation(level: number, ranks: TownRank[]): RenownPresentation {
  const maxLevel = ranks.at(-1)?.levels.end ?? 0;
  const currentRankIndex = Math.max(
    ranks.findLastIndex((rank) => getRankState(level, rank) === "current"),
    0,
  );
  const currentRank = ranks[currentRankIndex];
  const rankLevelSpan = Math.max(currentRank.levels.end - currentRank.levels.start + 1, 1);
  const levelsIntoRank = Math.max(level - currentRank.levels.start, 0);

  return {
    currentRank,
    currentRankIndex,
    isMaxed: level >= maxLevel,
    levelsIntoRank,
    maxLevel,
    overallPercent: maxLevel > 0 ? Math.min(Math.max((level / maxLevel) * 100, 0), 100) : 0,
    rankColor: townRankColor(currentRankIndex),
    rankLevelSpan,
    rankPercent: Math.min((levelsIntoRank / rankLevelSpan) * 100, 100),
  };
}
