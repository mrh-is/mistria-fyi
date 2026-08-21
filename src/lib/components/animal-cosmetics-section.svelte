<script lang="ts">
  import { trackerData } from "$lib/data";
  import { userState } from "$lib/stores/user-state.svelte";
  import { recordEntries } from "$lib/utils";

  import AnimalSubcategory from "./animal-subcategory.svelte";

  import type { AnimalId, CosmeticId } from "$lib/types/tracker-data";

  import type {
    AnimalSubcategoryRowProps,
    AnimalSubcategorySectionConfig,
  } from "./animal-subcategory.types";

  function hasCompletedCosmetic(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    return userState.state.completed.animalCosmetics[animalId].has(cosmeticId);
  }

  function isCosmeticVisible(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    return !(hasCompletedCosmetic(animalId, cosmeticId) && userState.state.showCompleted);
  }

  function hasDisplayableCosmetic(animalId: AnimalId): boolean {
    const cosmeticIds = Object.keys(trackerData.animals[animalId].cosmetics) as CosmeticId[];
    if (isSpeciesVisible(animalId)) {
      return cosmeticIds.some((cid) => isCosmeticVisible(animalId, cid));
    } else {
      return cosmeticIds.length > 0;
    }
  }

  function sectionConfig(animalId: AnimalId): AnimalSubcategorySectionConfig<CosmeticId> {
    const animal = trackerData.animals[animalId];
    let completedCount = 0;
    let displayableCount = 0;
    let visibleCosmetics: AnimalSubcategoryRowProps<CosmeticId>[] = [];
    recordEntries(animal.cosmetics).forEach(([cid, { name }]) => {
      displayableCount++;
      const cosmeticId = cid;
      const completed = hasCompletedCosmetic(animalId, cosmeticId);
      if (completed) completedCount++;
      if (isCosmeticVisible(animalId, cosmeticId)) {
        visibleCosmetics.push({
          completed,
          id: cosmeticId,
          name,
          redacted: false,
          sources: [],
        });
      }
    });
    return {
      displayableCompletedItemCount: completedCount,
      displayableItemCount: displayableCount,
      isVisible: isSpeciesVisible(animalId),
      visibleItems: visibleCosmetics,
    };
  }

  let {
    areAllAnimalsComplete,
    isAnimalComplete,
    isSpeciesVisible,
  }: {
    areAllAnimalsComplete: () => boolean;
    isAnimalComplete: (animalId: AnimalId) => boolean;
    isSpeciesVisible: (animalId: AnimalId) => boolean;
  } = $props();
</script>

<AnimalSubcategory
  {areAllAnimalsComplete}
  completionCheck={hasCompletedCosmetic}
  hasDisplayableItem={hasDisplayableCosmetic}
  {isAnimalComplete}
  name="Cosmetics"
  {sectionConfig}
  toggleCompletion={(animalId: AnimalId, variantId: CosmeticId) => {
    userState.toggleAnimalCosmetic(animalId, variantId);
  }}
/>
