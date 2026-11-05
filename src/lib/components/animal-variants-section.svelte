<script lang="ts">
  import AnimalSubcategory from "#lib/components/animal-subcategory.svelte";
  import {
    registerPageSearch,
    showsCompletedRows,
    visibleWindows,
  } from "#lib/controllers/page-search.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { animalNameId, getName, nameCollator } from "#lib/data/names.js";
  import {
    getVariantSeason,
    isAnimalVariantSpoilered,
    isVariantInScope as isVariantInScopeEngine,
  } from "#lib/engine/animal-availability.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { recordKeys } from "#lib/utils/record.js";

  import type {
    AnimalSubcategoryRowProps,
    AnimalSubcategorySectionConfig,
  } from "#lib/components/animal-subcategory.types.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type {
    AnimalId,
    AnimalVariant,
    AnimalVariantId,
    AnimalVariantTier,
    Season,
  } from "#lib/types/tracker-data.js";

  function forEachVariant(
    animalId: AnimalId,
    callbackfn: (value: [AnimalVariantId, AnimalVariant], tier: number) => void,
  ) {
    for (const [index, tier] of trackerData.animals[animalId].variantTiers.entries()) {
      for (const [variantId, variant] of tierEntries(tier)) {
        callbackfn([variantId, variant], index);
      }
    }
  }

  function hasCompletedVariant(animalId: AnimalId, variantId: AnimalVariantId): boolean {
    return userState.state.progress.animals[animalId]?.has(variantId) ?? false;
  }

  function hasDisplayableVariant(animalId: AnimalId): boolean {
    const isAnimalVisible = isSpeciesVisible(animalId);
    return someVariant(animalId, ([variantId, variant]) => {
      if (!matchesSearch(animalId, variantId)) return false;
      const completed = hasCompletedVariant(animalId, variantId);
      if (isAnimalVisible) {
        return isVariantVisible(animalId, variant, completed);
      }
      return isVariantInScope(animalId, variant, completed);
    });
  }

  function someVariant(
    animalId: AnimalId,
    predicate: (value: [AnimalVariantId, AnimalVariant]) => boolean,
  ): boolean {
    return trackerData.animals[animalId].variantTiers.some((tier) =>
      tierEntries(tier).some((entry) => predicate(entry)),
    );
  }

  function tierEntries(tier: AnimalVariantTier): [AnimalVariantId, AnimalVariant][] {
    return Object.entries(tier) as [AnimalVariantId, AnimalVariant][];
  }

  const SEASON_ORDER: Record<Season, number> = { fall: 2, spring: 0, summer: 1, winter: 3 };

  interface VariantRowConfig extends AnimalSubcategoryRowProps<AnimalVariantId> {
    season?: Season;
    tier: number;
  }

  function isVariantInScope(
    animalId: AnimalId,
    variant: AnimalVariant,
    completed: boolean,
  ): boolean {
    if (!toolbarState.matchesSourceFilters([variant.source])) return false;
    if (completed) return true;
    return isVariantInScopeEngine(
      variant,
      trackerData.animals[animalId].visibility,
      userState.progressContext,
      visibleWindows(),
    );
  }

  /** A variant matches through its own name or its animal's, so “cow” finds every cow. */
  function matchesSearch(animalId: AnimalId, variantId: AnimalVariantId): boolean {
    const query = toolbarState.searchQuery;
    if (!query) return true;
    if (!isSpeciesVisible(animalId) || isVariantSpoilered(animalId, variantId)) return false;
    return [animalNameId(animalId, "core"), animalNameId(animalId, "variants", variantId)].some(
      (nameId) => matchesName(getName("animals", nameId, locale), query, locale),
    );
  }

  function isVariantSpoilered(animalId: AnimalId, variantId: AnimalVariantId): boolean {
    return isAnimalVariantSpoilered(
      animalId,
      variantId,
      userState.state.progress.animals[animalId],
      userState.state.showSpoilers,
    );
  }

  function isVariantVisible(
    animalId: AnimalId,
    variant: AnimalVariant,
    completed: boolean,
  ): boolean {
    if (!isVariantInScope(animalId, variant, completed)) return false;
    return !completed || showsCompletedRows();
  }
  function sectionConfig(animalId: AnimalId): AnimalSubcategorySectionConfig<AnimalVariantId> {
    let displayableCompletedItemCount = 0;
    let displayableItemCount = 0;
    const visibleItems: VariantRowConfig[] = [];
    forEachVariant(animalId, ([vid, variant], tier) => {
      if (!matchesSearch(animalId, vid)) return;
      const completed = hasCompletedVariant(animalId, vid);
      if (!isVariantInScope(animalId, variant, completed)) return;
      displayableItemCount++;
      if (completed) displayableCompletedItemCount++;

      if (!completed || showsCompletedRows()) {
        const totalTiers = trackerData.animals[animalId].variantTiers.length;
        visibleItems.push({
          completed,
          id: vid,
          name: getName("animals", animalNameId(animalId, "variants", vid), locale),
          season: getVariantSeason(variant),
          sources: [variant.source],
          spoilered: isVariantSpoilered(animalId, vid),
          subtitle:
            totalTiers > 1 ? getName("ui", `tier_${(tier + 1).toString()}`, locale) : undefined,
          tier,
        });
      }
    });
    visibleItems.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;

      const orderA = SEASON_ORDER[a.season ?? "winter"];
      const orderB = SEASON_ORDER[b.season ?? "winter"];
      if (orderA !== orderB) return orderA - orderB;

      return nameCollator(locale).compare(a.name, b.name);
    });
    return {
      displayableCompletedItemCount,
      displayableItemCount,
      isVisible: isSpeciesVisible(animalId),
      visibleItems,
    };
  }

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

  function countMatches(animalId: AnimalId): number {
    let matches = 0;
    forEachVariant(animalId, ([variantId]) => {
      if (matchesSearch(animalId, variantId)) matches++;
    });
    return matches;
  }

  registerPageSearch(() => {
    let matches = 0;
    let visible = 0;
    for (const animalId of recordKeys(trackerData.animals)) {
      matches += countMatches(animalId);
      visible += sectionConfig(animalId).visibleItems.length;
    }
    return { matches, visible };
  });
</script>

<AnimalSubcategory
  factField="animals"
  {areAllAnimalsComplete}
  completionCheck={hasCompletedVariant}
  hasDisplayableItem={hasDisplayableVariant}
  {isAnimalComplete}
  {locale}
  name={getName("ui", "color_variant", locale)}
  reportCategory="animal-variants"
  {sectionConfig}
  toggleCompletion={(animalId: AnimalId, variantId: AnimalVariantId) => {
    userState.toggleAnimalVariant(animalId, variantId);
  }}
/>
