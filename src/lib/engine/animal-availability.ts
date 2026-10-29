import { trackerData } from "#lib/data/index.js";
import { isItemAvailable } from "#lib/engine/availability.js";

import type { RowWindowContext } from "#lib/engine/availability.js";
import type { AvailabilityWindow } from "#lib/types/availability.js";
import type { AnimalId, AnimalVariant, AnimalVariantId, Season } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

export function getVariantSeason(variant: AnimalVariant): Season | undefined {
  if (variant.source.type === "breed" && variant.source.availability?.type === "season") {
    return variant.source.availability.seasons[0];
  }
  return undefined;
}

/** A discovered tier reveals itself & the next tier; recorded variants are always revealed. */
export function isAnimalVariantSpoilered(
  animalId: AnimalId,
  variantId: AnimalVariantId,
  completedVariants: ReadonlySet<AnimalVariantId> | undefined,
  showSpoilers: boolean,
): boolean {
  if (showSpoilers || completedVariants?.has(variantId)) return false;
  let foundThisVariant = false;
  for (const tier of trackerData.animals[animalId].variantTiers.toReversed()) {
    const wasThisVariantLastTier = foundThisVariant;
    for (const id of Object.keys(tier)) {
      if (completedVariants?.has(id as AnimalVariantId)) return false;
      if (id === variantId) foundThisVariant = true;
    }
    if (wasThisVariantLastTier) return true;
  }
  return true;
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
