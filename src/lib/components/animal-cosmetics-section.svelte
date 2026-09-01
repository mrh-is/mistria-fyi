<script lang="ts">
  import { trackerData } from "$lib/data";
  import { isVisible } from "$lib/engine/visibility.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte";
  import { userState } from "$lib/stores/user-state.svelte";
  import { recordEntries } from "$lib/utils";
  import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";

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
    if (
      !toolbarState.matchesSourceFilters(
        trackerData.animals[animalId].cosmetics[cosmeticId].sources,
      )
    ) {
      return false;
    }
    return !hasCompletedCosmetic(animalId, cosmeticId) || userState.state.showCompleted;
  }

  function hasDisplayableCosmetic(animalId: AnimalId): boolean {
    const cosmeticIds = Object.keys(trackerData.animals[animalId].cosmetics) as CosmeticId[];
    if (isSpeciesVisible(animalId)) {
      return cosmeticIds.some((cid) => isCosmeticVisible(animalId, cid));
    } else {
      return cosmeticIds.some((cosmeticId) =>
        toolbarState.matchesSourceFilters(
          trackerData.animals[animalId].cosmetics[cosmeticId].sources,
        ),
      );
    }
  }

  function sectionConfig(animalId: AnimalId): AnimalSubcategorySectionConfig<CosmeticId> {
    const animal = trackerData.animals[animalId];
    let completedCount = 0;
    let displayableCount = 0;
    let visibleCosmetics: AnimalSubcategoryRowProps<CosmeticId>[] = [];
    recordEntries(animal.cosmetics).forEach(([cid, { name }]) => {
      if (!toolbarState.matchesSourceFilters(animal.cosmetics[cid].sources)) return;
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
          sources: animal.cosmetics[cosmeticId].sources,
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

  let redactedStoreIds = $derived(
    new Set(
      recordEntries(trackerData.stores)
        .filter(
          ([, { visibility }]) => visibility && !isVisible(visibility, userState.progressionState),
        )
        .map(([id]) => id),
    ),
  );

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds));

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
  lookups={baseLookups}
  name="Cosmetics"
  {sectionConfig}
  toggleCompletion={(animalId: AnimalId, variantId: CosmeticId) => {
    userState.toggleAnimalCosmetic(animalId, variantId);
  }}
/>
