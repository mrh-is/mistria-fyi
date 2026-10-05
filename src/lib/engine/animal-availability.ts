import { legacyAvailabilityWindows } from "#lib/types/availability.js";

import type { AvailabilitySelection } from "#lib/types/availability.js";
import type { AnimalVariant, Season } from "#lib/types/tracker-data.js";

export function getVariantSeason(variant: AnimalVariant): Season | undefined {
  if (variant.source.type === "breed" && variant.source.availability?.type === "season") {
    return variant.source.availability.seasons[0];
  }
}

export function isVariantInScope(
  variant: AnimalVariant,
  currentSeason: Season,
  availability: AvailabilitySelection,
): boolean {
  const season = getVariantSeason(variant);
  const window = season === undefined ? "anytime" : season === currentSeason ? "now" : "later";
  const windows =
    typeof availability === "string" ? legacyAvailabilityWindows(availability) : availability;
  return windows.includes(window);
}
