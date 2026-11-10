import type { Season, Weather } from "#lib/types/tracker-data.js";

/** The in-game day: what the clock sets, & what availability reads. */
export interface WorldDay {
  day?: number;
  season: Season;
  weather: Weather;
}

/** What a save says about the day. A value it couldn't read is `undefined`, never a guess. */
export interface SaveDay {
  day?: number;
  season: Season | undefined;
  weather: undefined | Weather;
}

/** Only fields the tab changed take precedence over the clock read under the lock. */
export function rebaseWorldDay(stored: WorldDay, before: WorldDay, after: WorldDay): WorldDay {
  const date = before.season === after.season && before.day === after.day ? stored : after;
  return {
    ...(date.day === undefined ? {} : { day: date.day }),
    season: date.season,
    weather: before.weather === after.weather ? stored.weather : after.weather,
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
  return {
    ...(dayNumber === undefined ? {} : { day: dayNumber }),
    season,
    weather: isWeatherInSeason(weather, season) ? weather : "calm",
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
