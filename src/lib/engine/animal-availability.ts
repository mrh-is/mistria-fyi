import { trackerData } from "#lib/data/index.js";

import type { AnimalId, AnimalVariant, AnimalVariantId, Season } from "#lib/types/tracker-data.js";

export function getVariantSeason(variant: AnimalVariant): Season | undefined {
  if (variant.source.type === "breed" && variant.source.availability?.type === "season") {
    return variant.source.availability.seasons[0];
  }
  return undefined;
}

/** The first tier is always open; a find in a tier reveals that tier & the next one. */
export function isAnimalVariantSpoilered(
  animalId: AnimalId,
  variantId: AnimalVariantId,
  completedVariants: ReadonlySet<AnimalVariantId> | undefined,
  showSpoilers: boolean,
): boolean {
  if (showSpoilers || completedVariants?.has(variantId)) return false;
  const tiers = trackerData.animals[animalId].variantTiers;
  const variantTier = tiers.findIndex((tier) => variantId in tier);
  const highestFoundTier = tiers.findLastIndex((tier) =>
    Object.keys(tier).some((id) => completedVariants?.has(id as AnimalVariantId)),
  );
  return variantTier > highestFoundTier + 1;
}
