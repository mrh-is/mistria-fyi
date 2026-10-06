import { rankColor } from "#lib/utils/palette.js";

import type { TownRank } from "#lib/types/tracker-data.js";

export type RankState = "completed" | "current" | "upcoming";

export function getRankState(level: number, rank: TownRank): RankState {
  if (level < rank.levels.start) return "upcoming";
  if (level > rank.levels.end) return "completed";
  return "current";
}

export interface RenownPresentation {
  color: string;
  currentRank: TownRank;
  currentRankIndex: number;
  isMaxed: boolean;
  maxLevel: number;
  overallPercent: number;
  rankPercent: number;
  rankSpan: number;
  withinRank: number;
}

export function getRenownPresentation(level: number, ranks: TownRank[]): RenownPresentation {
  const maxLevel = ranks.at(-1)?.levels.end ?? 0;
  const currentRankIndex = Math.max(
    ranks.findLastIndex((rank) => getRankState(level, rank) === "current"),
    0,
  );
  const currentRank = ranks[currentRankIndex];
  const rankSpan = Math.max(currentRank.levels.end - currentRank.levels.start + 1, 1);
  const withinRank = Math.max(level - currentRank.levels.start, 0);

  return {
    color: rankColor(currentRankIndex),
    currentRank,
    currentRankIndex,
    isMaxed: level >= maxLevel,
    maxLevel,
    overallPercent: maxLevel > 0 ? Math.min(Math.max((level / maxLevel) * 100, 0), 100) : 0,
    rankPercent: Math.min((withinRank / rankSpan) * 100, 100),
    rankSpan,
    withinRank,
  };
}
