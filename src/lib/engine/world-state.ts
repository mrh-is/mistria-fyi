import type { Season, Weather } from "$lib/types/tracker-data";

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
