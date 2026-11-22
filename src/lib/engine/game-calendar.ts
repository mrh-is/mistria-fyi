/** The game's calendar, as saves record it: seconds since the first morning of the first year. */
import { seasonFromOrdinal, seasonOrdinal } from "#lib/engine/domain-primitives.js";

import type { Season } from "#lib/types/tracker-data.js";

/** One in-game day on the save's calendar (`gamedata.date`). */
export const GAME_DAY = 259_200;
export const DAYS_PER_SEASON = 28;
export const SEASONS_PER_YEAR = 4;

/** A date on the game's calendar, as the save records it. */
export interface GameDate {
  /** 1 through 28. */
  day: number;
  season: Season;
  /** From 1. */
  year: number;
}

export function gameDayOfYear({ day, season }: Pick<GameDate, "day" | "season">): number {
  return seasonOrdinal(season) * DAYS_PER_SEASON + day;
}

export function gameDaysBetween(from: GameDate, to: GameDate): number {
  return (
    (to.year - from.year) * DAYS_PER_SEASON * SEASONS_PER_YEAR +
    gameDayOfYear(to) -
    gameDayOfYear(from)
  );
}

/** The date `seconds` falls on. */
export function gameDateAt(seconds: number): GameDate {
  const days = Math.floor(seconds / GAME_DAY);
  const seasons = Math.floor(days / DAYS_PER_SEASON);
  return {
    day: (days % DAYS_PER_SEASON) + 1,
    season: seasonFromOrdinal(seasons % SEASONS_PER_YEAR),
    year: Math.floor(seasons / SEASONS_PER_YEAR) + 1,
  };
}
