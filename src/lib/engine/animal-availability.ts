import { legacyAvailabilityWindows } from "#lib/types/availability.js";

import type { AvailabilitySelection } from "#lib/types/availability.js";
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
  availability: AvailabilitySelection,
): boolean {
  const season = getVariantSeason(variant);
  const window = getAvailabilityWindow(season, currentSeason);
  const windows =
    typeof availability === "string" ? legacyAvailabilityWindows(availability) : availability;
  return windows.includes(window);
}
