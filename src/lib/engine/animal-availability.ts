import type { AvailabilityWindow } from "#lib/types/availability.js";
import type { AnimalVariant, Season } from "#lib/types/tracker-data.js";

export function getVariantSeason(variant: AnimalVariant): Season | undefined {
  if (variant.source.type === "breed" && variant.source.availability?.type === "season") {
    return variant.source.availability.seasons[0];
  }
  return undefined;
}

function getAvailabilityWindow(
  season: Season | undefined,
  currentSeason: Season,
): "anytime" | "later" | "now" {
  if (season === undefined) return "anytime";
  return season === currentSeason ? "now" : "later";
}

export function isVariantInScope(
  variant: AnimalVariant,
  currentSeason: Season,
  windows: readonly AvailabilityWindow[],
): boolean {
  const season = getVariantSeason(variant);
  return windows.includes(getAvailabilityWindow(season, currentSeason));
}
