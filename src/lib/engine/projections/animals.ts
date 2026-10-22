import { trackerData } from "#lib/data/index.js";
import { isVariantInScope } from "#lib/engine/animal-availability.js";
import { countChecklist, isSpoilered } from "#lib/engine/projections/category-projection.js";
import { recordEntries, recordKeys } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
  ChecklistRow,
} from "#lib/engine/projections/category-projection.js";
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

/**
 * Every variant, cosmetic, appearance, Mistmare perk, & skin is one step. A variant is in scope
 * only within the context's availability windows; everything else stays in scope until collected.
 */
export function projectAnimals(
  ctx: ProgressContext,
  options: CategoryProjectionOptions = {},
): AnimalsProjection {
  const { progress } = ctx;
  const animals = recordEntries(trackerData.animals).map(([animalId, animal]) => ({
    animal,
    animalId,
    spoilered: isSpoilered(animal.visibility, options.progressionState),
  }));
  const rows: AnimalsRow[] = [];
  for (const { animal, animalId, spoilered } of animals) {
    for (const tier of animal.variantTiers) {
      for (const [variantId, variant] of recordEntries(tier)) {
        const completed = progress.animals[animalId]?.has(variantId) ?? false;
        rows.push({
          animalId,
          completed,
          inScope: isVariantInScope(variant, ctx.worldState.season, ctx.availabilityWindows),
          kind: "variant",
          spoilered,
          variantId,
        });
      }
    }
  }
  for (const { animal, animalId, spoilered } of animals) {
    for (const cosmeticId of recordKeys(animal.cosmetics)) {
      rows.push({
        animalId,
        completed: progress.animalCosmetics[animalId]?.has(cosmeticId) ?? false,
        cosmeticId,
        inScope: true,
        kind: "cosmetic",
        spoilered,
      });
    }
  }
  for (const [id, appearance] of recordEntries(trackerData.mount.appearances)) {
    rows.push({
      completed: progress.mountAppearances.has(id),
      id,
      inScope: true,
      kind: "mountAppearance",
      spoilered: isSpoilered(appearance.visibility, options.progressionState),
    });
  }
  for (const [id, perk] of recordEntries(trackerData.mount.perks)) {
    rows.push({
      completed: progress.unlockedPerks.has(id),
      id,
      inScope: true,
      kind: "mountPerk",
      spoilered: isSpoilered(perk.visibility, options.progressionState),
    });
  }
  for (const id of recordKeys(trackerData.pets.cosmetics)) {
    rows.push({
      completed: progress.petCosmetics.has(id),
      id,
      inScope: true,
      kind: "petCosmetic",
      spoilered: false,
    });
  }
  for (const id of recordKeys(trackerData.pets.skins)) {
    rows.push({
      completed: progress.petSkins.has(id),
      id,
      inScope: true,
      kind: "petSkin",
      spoilered: false,
    });
  }
  return { rows, totals: countChecklist(rows) };
}
