import { isItemAvailable } from "#lib/engine/availability.js";

import type { RowWindowContext } from "#lib/engine/availability.js";
import type { AvailabilityWindow } from "#lib/types/availability.js";
import type { AnimalVariant, Season } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

export function getVariantSeason(variant: AnimalVariant): Season | undefined {
  if (variant.source.type === "breed" && variant.source.availability?.type === "season") {
    return variant.source.availability.seasons[0];
  }
  return undefined;
}

/** A variant takes its one source's window; a spoiler-hidden species makes every variant "later". */
export function isVariantInScope(
  variant: AnimalVariant,
  animalVisibility: undefined | VisibilityCondition,
  ctx: RowWindowContext,
  windows: readonly AvailabilityWindow[],
): boolean {
  return isItemAvailable({ sources: [variant.source], visibility: animalVisibility }, ctx, windows);
}
