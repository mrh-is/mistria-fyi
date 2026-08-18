<script lang="ts">
  import { trackerData } from "$lib/data/index.js";
  import { isEntityNameVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import AllCompleted from "./all-completed.svelte";
  import AnimalCosmeticsSection from "./animal-cosmetics-section.svelte";
  import AnimalVariantsSection from "./animal-variants-section.svelte";

  import type {
    AnimalId,
    AnimalVariant,
    AnimalVariantId,
    CosmeticId,
  } from "$lib/types/tracker-data";

  function someVariant(
    animalId: AnimalId,
    predicate: (value: [AnimalVariantId, AnimalVariant]) => boolean,
  ): boolean {
    return trackerData.animals[animalId].variantTiers.some((tier) => {
      return (Object.entries(tier) as [AnimalVariantId, AnimalVariant][]).some(predicate);
    });
  }

  function hasCompletedVariant(animalId: AnimalId, variantId: AnimalVariantId): boolean {
    return userState.state.completed.animals[animalId].has(variantId);
  }

  function hasCompletedCosmetic(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    return userState.state.completed.animalCosmetics[animalId].has(cosmeticId);
  }

  function isSpeciesVisible(animalId: AnimalId): boolean {
    const visibility = trackerData.animals[animalId].visibility ?? { type: "always" };
    return isEntityNameVisible(visibility, userState.progressionState);
  }

  function isAnimalComplete(animalId: AnimalId): boolean {
    const someVariantIncomplete = someVariant(animalId, ([variantId]) => {
      return !hasCompletedVariant(animalId, variantId);
    });
    if (someVariantIncomplete) return false;

    const cosmeticIds = Object.keys(trackerData.animals[animalId].cosmetics) as CosmeticId[];
    return cosmeticIds.every((cosmeticId) => hasCompletedCosmetic(animalId, cosmeticId));
  }

  function areAllAnimalsComplete(): boolean {
    return Object.keys(trackerData.animals).every((id) => isAnimalComplete(id as AnimalId));
  }
</script>

<AnimalVariantsSection {areAllAnimalsComplete} {isAnimalComplete} {isSpeciesVisible} />

<AnimalCosmeticsSection {areAllAnimalsComplete} {isAnimalComplete} {isSpeciesVisible} />

<AllCompleted isAllCompleted={areAllAnimalsComplete()} />
