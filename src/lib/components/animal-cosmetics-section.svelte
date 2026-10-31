<script lang="ts">
  import AnimalSubcategory from "#lib/components/animal-subcategory.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { animalNameId, getName } from "#lib/data/names.js";
  import * as m from "#lib/paraglide/messages.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { recordEntries } from "#lib/utils/record.js";

  import type {
    AnimalSubcategoryRowProps,
    AnimalSubcategorySectionConfig,
  } from "#lib/components/animal-subcategory.types.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { AnimalId, CosmeticId } from "#lib/types/tracker-data.js";

  function hasCompletedCosmetic(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    return userState.state.progress.animalCosmetics[animalId]?.has(cosmeticId) ?? false;
  }

  function hasDisplayableCosmetic(animalId: AnimalId): boolean {
    const cosmeticIds = Object.keys(trackerData.animals[animalId].cosmetics) as CosmeticId[];
    if (isSpeciesVisible(animalId)) {
      return cosmeticIds.some((cid) => isCosmeticVisible(animalId, cid));
    }
    return cosmeticIds.some((cosmeticId) =>
      toolbarState.matchesSourceFilters(
        trackerData.animals[animalId].cosmetics[cosmeticId].sources,
      ),
    );
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

  function sectionConfig(animalId: AnimalId): AnimalSubcategorySectionConfig<CosmeticId> {
    const animal = trackerData.animals[animalId];
    let completedCount = 0;
    let displayableCount = 0;
    const visibleCosmetics: AnimalSubcategoryRowProps<CosmeticId>[] = [];
    for (const [cid] of recordEntries(animal.cosmetics)) {
      if (!toolbarState.matchesSourceFilters(animal.cosmetics[cid].sources)) continue;
      displayableCount++;
      const cosmeticId = cid;
      const completed = hasCompletedCosmetic(animalId, cosmeticId);
      if (completed) completedCount++;
      if (isCosmeticVisible(animalId, cosmeticId)) {
        visibleCosmetics.push({
          completed,
          id: cosmeticId,
          name: getName("animals", animalNameId(animalId, "cosmetics", cosmeticId), locale),
          sources: animal.cosmetics[cosmeticId].sources,
          spoilered: false,
        });
      }
    }
    return {
      displayableCompletedItemCount: completedCount,
      displayableItemCount: displayableCount,
      isVisible: isSpeciesVisible(animalId),
      visibleItems: visibleCosmetics,
    };
  }

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  let {
    areAllAnimalsComplete,
    isAnimalComplete,
    isSpeciesVisible,
    locale,
  }: {
    areAllAnimalsComplete: () => boolean;
    isAnimalComplete: (animalId: AnimalId) => boolean;
    isSpeciesVisible: (animalId: AnimalId) => boolean;
    locale: LocaleCode;
  } = $props();

  let baseLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));
</script>

<AnimalSubcategory
  factField="animalCosmetics"
  {areAllAnimalsComplete}
  completionCheck={hasCompletedCosmetic}
  hasDisplayableItem={hasDisplayableCosmetic}
  {isAnimalComplete}
  {locale}
  lookups={baseLookups}
  name={m.animals_cosmetics_section_name()}
  reportCategory="animal-cosmetics"
  {sectionConfig}
  toggleCompletion={(animalId: AnimalId, variantId: CosmeticId) => {
    userState.toggleAnimalCosmetic(animalId, variantId);
  }}
/>
