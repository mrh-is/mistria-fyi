<script lang="ts">
  import AnimalSubcategory from "#lib/components/animal-subcategory.svelte";
  import { pageShelfFacts, registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { animalNameId, getName } from "#lib/data/names.js";
  import { countShelfRows, filteredCounts } from "#lib/engine/shelves.js";
  import * as m from "#lib/paraglide/messages.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { recordEntries, recordKeys } from "#lib/utils/record.js";

  import type {
    AnimalSubcategoryRowProps,
    AnimalSubcategorySectionConfig,
  } from "#lib/components/animal-subcategory.types.js";
  import type { ShelfRow } from "#lib/engine/shelves.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { AnimalId, CosmeticId } from "#lib/types/tracker-data.js";

  function hasCompletedCosmetic(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    return userState.state.progress.animalCosmetics[animalId]?.has(cosmeticId) ?? false;
  }

  function hasDisplayableCosmetic(animalId: AnimalId): boolean {
    const cosmeticIds = Object.keys(trackerData.animals[animalId].cosmetics) as CosmeticId[];
    return cosmeticIds.some((cid) => isCosmeticVisible(animalId, cid));
  }

  /** A cosmetic matches through its own name or its animal's, so “cow” finds every cow's. */
  function matchesSearch(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    const query = toolbarState.searchQuery;
    if (!query) return true;
    if (!isSpeciesVisible(animalId)) return false;
    return [animalNameId(animalId, "core"), animalNameId(animalId, "cosmetics", cosmeticId)].some(
      (nameId) => matchesName(getName("animals", nameId, locale), query, locale),
    );
  }

  function isCosmeticVisible(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    return (
      matchesSearch(animalId, cosmeticId) &&
      toolbarState.matchesSourceFilters(trackerData.animals[animalId].cosmetics[cosmeticId].sources)
    );
  }

  function cosmeticFacts(animalId: AnimalId, cosmeticId: CosmeticId): ShelfRow {
    const animal = trackerData.animals[animalId];
    return pageShelfFacts(
      { sources: animal.cosmetics[cosmeticId].sources, visibility: animal.visibility },
      hasCompletedCosmetic(animalId, cosmeticId),
    );
  }

  function sectionConfig(animalId: AnimalId): AnimalSubcategorySectionConfig<CosmeticId> {
    const animal = trackerData.animals[animalId];
    const cosmeticIds = recordEntries(animal.cosmetics).map(([id]) => id);
    const visibleItems = cosmeticIds
      .filter((id) => isCosmeticVisible(animalId, id))
      .map((id): AnimalSubcategoryRowProps<CosmeticId> => ({
        ...cosmeticFacts(animalId, id),
        id,
        name: getName("animals", animalNameId(animalId, "cosmetics", id), locale),
        sources: animal.cosmetics[id].sources,
        spoilered: false,
      }));
    return {
      displayableItemCount: visibleItems.length,
      isVisible: isSpeciesVisible(animalId),
      matchingRows: cosmeticIds
        .filter((id) => matchesSearch(animalId, id))
        .map((id) => cosmeticFacts(animalId, id)),
      progress: countShelfRows(cosmeticIds.map((id) => cosmeticFacts(animalId, id))),
      visibleItems,
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

  registerPageSearch(() => {
    const configs = recordKeys(trackerData.animals).map((animalId) => sectionConfig(animalId));
    return {
      filtered: filteredCounts(configs.flatMap(({ matchingRows }) => matchingRows)),
      visible: configs.reduce((sum, { visibleItems }) => sum + visibleItems.length, 0),
    };
  });
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
