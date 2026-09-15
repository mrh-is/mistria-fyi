<script lang="ts">
  import { trackerData, trackerIndex } from "$lib/data/index.js";
  import { isEntityNameVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { registerSourceFilters } from "$lib/utils/source-filter-registration.svelte.js";

  import AllCompleted from "./all-completed.svelte";
  import AnimalCosmeticsSection from "./animal-cosmetics-section.svelte";
  import AnimalVariantsSection from "./animal-variants-section.svelte";
  import PetCollectiblesSection from "./pet-collectibles-section.svelte";

  import type {
    AnimalId,
    AnimalVariant,
    AnimalVariantId,
    CosmeticId,
    PetCosmeticSetId,
    PetSkinId,
  } from "$lib/types/tracker-data";

  function areAllAnimalsComplete(): boolean {
    const allAnimals = Object.keys(trackerData.animals).every((id) =>
      isAnimalComplete(id as AnimalId),
    );
    const allPetCosmetics = Object.keys(trackerData.pets.cosmetics).every((id) =>
      userState.state.completed.petCosmetics.has(id as PetCosmeticSetId),
    );
    const allPetSkins = Object.keys(trackerData.pets.skins).every((id) =>
      userState.state.completed.petSkins.has(id as PetSkinId),
    );
    return allAnimals && allPetCosmetics && allPetSkins;
  }

  function hasCompletedCosmetic(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    return userState.state.completed.animalCosmetics[animalId].has(cosmeticId);
  }

  function hasCompletedVariant(animalId: AnimalId, variantId: AnimalVariantId): boolean {
    return userState.state.completed.animals[animalId].has(variantId);
  }

  function isAnimalComplete(animalId: AnimalId): boolean {
    const someVariantIncomplete = someVariant(animalId, ([variantId]) => {
      return !hasCompletedVariant(animalId, variantId);
    });
    if (someVariantIncomplete) return false;

    const cosmeticIds = Object.keys(trackerData.animals[animalId].cosmetics) as CosmeticId[];
    return cosmeticIds.every((cosmeticId) => hasCompletedCosmetic(animalId, cosmeticId));
  }

  function isSpeciesVisible(animalId: AnimalId): boolean {
    const visibility = trackerData.animals[animalId].visibility;
    return isEntityNameVisible(visibility, userState.progressionState);
  }

  function someVariant(
    animalId: AnimalId,
    predicate: (value: [AnimalVariantId, AnimalVariant]) => boolean,
  ): boolean {
    return trackerData.animals[animalId].variantTiers.some((tier) => {
      return (Object.entries(tier) as [AnimalVariantId, AnimalVariant][]).some(predicate);
    });
  }

  registerSourceFilters("animals", () => trackerIndex.categorySourceTypes.animals);
</script>

<AnimalVariantsSection {areAllAnimalsComplete} {isAnimalComplete} {isSpeciesVisible} />

<AnimalCosmeticsSection {areAllAnimalsComplete} {isAnimalComplete} {isSpeciesVisible} />

<PetCollectiblesSection {areAllAnimalsComplete} />

<AllCompleted isAllCompleted={areAllAnimalsComplete()} />
