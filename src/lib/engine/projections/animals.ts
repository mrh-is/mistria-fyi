import { trackerData } from "#lib/data/index.js";
import { isAnimalVariantSpoilered } from "#lib/engine/animal-availability.js";
import { isSpoilered } from "#lib/engine/projections/category-projection.js";
import { countShelfRows, shelfFacts } from "#lib/engine/shelves.js";
import { recordEntries } from "#lib/utils/record.js";

import type { AvailabilityRow } from "#lib/engine/availability.js";
import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
  ChecklistRow,
} from "#lib/engine/projections/category-projection.js";
import type { ShelfRow } from "#lib/engine/shelves.js";
import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  MountAppearanceId,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
} from "#lib/types/tracker-data.js";

/** One collectible on the animals page; `kind` says which progress set records it. */
export type AnimalsRow = ChecklistRow &
  (
    | { animalId: AnimalId; cosmeticId: CosmeticId; kind: "cosmetic" }
    | { animalId: AnimalId; kind: "variant"; variantId: AnimalVariantId }
    | { id: MountAppearanceId; kind: "mountAppearance" }
    | { id: PerkId; kind: "mountPerk" }
    | { id: PetCosmeticSetId; kind: "petCosmetic" }
    | { id: PetSkinId; kind: "petSkin" }
  );

export interface AnimalsProjection extends CategoryProjection {
  /** Variants, then animal cosmetics, mount appearances & perks, pet cosmetics, & pet skins. */
  rows: AnimalsRow[];
}

/** Every variant, cosmetic, appearance, Mistmare perk, & skin is one step. */
export function projectAnimals(
  ctx: ProgressContext,
  options: CategoryProjectionOptions = {},
): AnimalsProjection {
  const { progress } = ctx;
  const facts = (row: AvailabilityRow, completed: boolean): ShelfRow =>
    shelfFacts(row, completed, ctx, options.showsSource);
  const animals = recordEntries(trackerData.animals).map(([animalId, animal]) => ({
    animal,
    animalId,
    spoilered: isSpoilered(animal.visibility, options.progressionState),
  }));
  const rows: AnimalsRow[] = [];
  for (const { animal, animalId, spoilered } of animals) {
    for (const tier of animal.variantTiers) {
      for (const [variantId, variant] of recordEntries(tier)) {
        const completedVariants = progress.animals[animalId];
        const row = facts(
          { sources: [variant.source], visibility: animal.visibility },
          completedVariants?.has(variantId) ?? false,
        );
        // A tier opens only once the tier before it is found, whatever "Show spoilers" reveals.
        const locked = isAnimalVariantSpoilered(animalId, variantId, completedVariants, false);
        rows.push({
          ...row,
          animalId,
          doable: row.doable && !locked,
          doableAnywhere: row.doableAnywhere && !locked,
          kind: "variant",
          spoilered,
          variantId,
        });
      }
    }
  }
  for (const { animal, animalId, spoilered } of animals) {
    for (const [cosmeticId, cosmetic] of recordEntries(animal.cosmetics)) {
      rows.push({
        ...facts(
          { sources: cosmetic.sources, visibility: animal.visibility },
          progress.animalCosmetics[animalId]?.has(cosmeticId) ?? false,
        ),
        animalId,
        cosmeticId,
        kind: "cosmetic",
        spoilered,
      });
    }
  }
  for (const [id, appearance] of recordEntries(trackerData.mount.appearances)) {
    rows.push({
      ...facts(appearance, progress.mountAppearances.has(id)),
      id,
      kind: "mountAppearance",
      spoilered: isSpoilered(appearance.visibility, options.progressionState),
    });
  }
  for (const [id, perk] of recordEntries(trackerData.mount.perks)) {
    rows.push({
      ...facts(perk, progress.unlockedPerks.has(id)),
      id,
      kind: "mountPerk",
      spoilered: isSpoilered(perk.visibility, options.progressionState),
    });
  }
  for (const [id, cosmetic] of recordEntries(trackerData.pets.cosmetics)) {
    rows.push({
      ...facts({ sources: cosmetic.sources }, progress.petCosmetics.has(id)),
      id,
      kind: "petCosmetic",
      spoilered: false,
    });
  }
  for (const [id, skin] of recordEntries(trackerData.pets.skins)) {
    rows.push({
      ...facts({ sources: skin.sources }, progress.petSkins.has(id)),
      id,
      kind: "petSkin",
      spoilered: false,
    });
  }
  return { rows, totals: countShelfRows(rows) };
}
