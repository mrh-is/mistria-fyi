import type { Season, Weather } from "#lib/types/tracker-data.js";

import type { GameDate } from "./game-calendar.js";

/** The in-game day: what the clock sets, & what availability reads. */
export interface WorldDay {
  day?: number;
  /** The date read from the last applied save, independent of edits to the clock. */
  saveDate?: GameDate;
  season: Season;
  weather: Weather;
  year?: number;
}

/** What a save says about the day. A value it couldn't read is `undefined`, never a guess. */
export interface SaveDay {
  day?: number;
  season: Season | undefined;
  weather: undefined | Weather;
  year?: number;
}

export function withoutRecordedDay({ season, weather }: WorldDay): WorldDay {
  return { season, weather };
}

/** Only fields the tab changed take precedence over the clock read under the lock. */
export function rebaseWorldDay(stored: WorldDay, before: WorldDay, after: WorldDay): WorldDay {
  const date =
    before.season === after.season && before.day === after.day && before.year === after.year
      ? stored
      : after;
  return {
    ...(date.day === undefined ? {} : { day: date.day }),
    ...(stored.saveDate === undefined ? {} : { saveDate: stored.saveDate }),
    season: date.season,
    weather: before.weather === after.weather ? stored.weather : after.weather,
    ...(date.year === undefined ? {} : { year: date.year }),
  };
}

/**
 * `world` with the save's day applied. Each value the save left unreadable stays as it was, and
 * weather the new season can't have clears to calm, as the clock's season control does.
 */
export function applySaveDay(world: WorldDay, day: SaveDay): WorldDay {
  const season = day.season ?? world.season;
  const weather = day.weather ?? world.weather;
  const dayNumber = day.day ?? (season === world.season ? world.day : undefined);
  const year = day.year ?? world.year;
  return {
    ...(dayNumber === undefined ? {} : { day: dayNumber }),
    ...(day.day !== undefined && day.season !== undefined && day.year !== undefined
      ? { saveDate: { day: day.day, season: day.season, year: day.year } }
      : {}),
    season,
    weather: isWeatherInSeason(weather, season) ? weather : "calm",
    ...(year === undefined ? {} : { year }),
  };
}

export function isWeatherInSeason(weather: Weather, season: Season): boolean {
  return weathersForSeason(season).includes(weather);
}

/** Weathers available for a given season (special only in spring/fall) */
export function weathersForSeason(season: Season): Weather[] {
  if (season === "summer" || season === "winter") {
    return ["calm", "inclement", "heavy_inclement"];
  }
  return ["calm", "inclement", "heavy_inclement", "special"];
}
