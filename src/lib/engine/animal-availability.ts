import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
import type { AnimalVariant, Season } from "$lib/types/tracker-data.js";

export function getVariantSeason(variant: AnimalVariant): Season | undefined {
  if (variant.source.type === "breed" && variant.source.availability?.type === "season") {
    return variant.source.availability.seasons[0];
  }
}

export function isVariantInScope(
  variant: AnimalVariant,
  currentSeason: Season,
  availabilityMode: AvailabilityMode,
): boolean {
  const season = getVariantSeason(variant);
  switch (availabilityMode) {
    case "available":
      return season === currentSeason || season === undefined;
    case "everything":
      return true;
    case "timely":
      return season === currentSeason;
  }
}
