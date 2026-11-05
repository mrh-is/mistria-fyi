import { trackerData } from "#lib/data/index.js";
import { isVariantInScope } from "#lib/engine/animal-availability.js";
import { countChecklist, isSpoilered } from "#lib/engine/projections/category-projection.js";
import { recordEntries } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
  ChecklistRow,
} from "#lib/engine/projections/category-projection.js";
import type { Source } from "#lib/types/acquisition.js";
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
  const matchesSources = (sources: Source[]): boolean => options.matchesSources?.(sources) ?? true;
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
          inScope:
            matchesSources([variant.source]) &&
            isVariantInScope(variant, animal.visibility, ctx, ctx.availabilityWindows),
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
        animalId,
        completed: progress.animalCosmetics[animalId]?.has(cosmeticId) ?? false,
        cosmeticId,
        inScope: matchesSources(cosmetic.sources),
        kind: "cosmetic",
        spoilered,
      });
    }
  }
  for (const [id, appearance] of recordEntries(trackerData.mount.appearances)) {
    rows.push({
      completed: progress.mountAppearances.has(id),
      id,
      inScope: matchesSources(appearance.sources),
      kind: "mountAppearance",
      spoilered: isSpoilered(appearance.visibility, options.progressionState),
    });
  }
  for (const [id, perk] of recordEntries(trackerData.mount.perks)) {
    rows.push({
      completed: progress.unlockedPerks.has(id),
      id,
      inScope: matchesSources(perk.sources),
      kind: "mountPerk",
      spoilered: isSpoilered(perk.visibility, options.progressionState),
    });
  }
  for (const [id, cosmetic] of recordEntries(trackerData.pets.cosmetics)) {
    rows.push({
      completed: progress.petCosmetics.has(id),
      id,
      inScope: matchesSources(cosmetic.sources),
      kind: "petCosmetic",
      spoilered: false,
    });
  }
  for (const [id, skin] of recordEntries(trackerData.pets.skins)) {
    rows.push({
      completed: progress.petSkins.has(id),
      id,
      inScope: matchesSources(skin.sources),
      kind: "petSkin",
      spoilered: false,
    });
  }
  return { rows, totals: countChecklist(rows) };
}
