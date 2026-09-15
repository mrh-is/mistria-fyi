<script lang="ts">
  import { trackerData } from "$lib/data/index.js";
  import {
    getVariantSeason,
    isVariantInScope as isVariantInScopeEngine,
  } from "$lib/engine/animal-availability.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import AnimalSubcategory from "./animal-subcategory.svelte";

  import type {
    AnimalId,
    AnimalVariant,
    AnimalVariantId,
    AnimalVariantTier,
    Season,
  } from "$lib/types/tracker-data.js";

  import type {
    AnimalSubcategoryRowProps,
    AnimalSubcategorySectionConfig,
  } from "./animal-subcategory.types";

  function forEachVariant(
    animalId: AnimalId,
    callbackfn: (value: [AnimalVariantId, AnimalVariant], tier: number) => void,
  ) {
    trackerData.animals[animalId].variantTiers.forEach((tier, index) => {
      tierEntries(tier).forEach(([variantId, variant]) => {
        callbackfn([variantId, variant], index);
      });
    });
  }

  function hasCompletedVariant(animalId: AnimalId, variantId: AnimalVariantId): boolean {
    return userState.state.completed.animals[animalId].has(variantId);
  }

  function hasDisplayableVariant(animalId: AnimalId): boolean {
    const isAnimalVisible = isSpeciesVisible(animalId);
    return someVariant(animalId, ([variantId, variant]) => {
      const completed = hasCompletedVariant(animalId, variantId);
      if (isAnimalVisible) {
        return isVariantVisible(variant, completed);
      } else {
        return isVariantInScope(variant, completed);
      }
    });
  }

  function someVariant(
    animalId: AnimalId,
    predicate: (value: [AnimalVariantId, AnimalVariant]) => boolean,
  ): boolean {
    return trackerData.animals[animalId].variantTiers.some((tier) => {
      return tierEntries(tier).some(predicate);
    });
  }

  function tierEntries(tier: AnimalVariantTier): [AnimalVariantId, AnimalVariant][] {
    return Object.entries(tier) as [AnimalVariantId, AnimalVariant][];
  }

  const SEASON_ORDER: Record<Season, number> = { fall: 2, spring: 0, summer: 1, winter: 3 };

  interface VariantRowConfig extends AnimalSubcategoryRowProps<AnimalVariantId> {
    season?: Season;
    tier: number;
  }

  function isVariantInScope(variant: AnimalVariant, completed: boolean): boolean {
    if (!toolbarState.matchesSourceFilters([variant.source])) return false;
    if (completed) return true;
    return isVariantInScopeEngine(
      variant,
      userState.state.worldState.season,
      userState.state.availabilityWindows,
    );
  }

  function isVariantSpoilered(animalId: AnimalId, variantId: AnimalVariantId): boolean {
    if (userState.state.showSpoilers) return false;

    const completedVariants = userState.state.completed.animals[animalId];
    if (completedVariants.has(variantId)) return false;

    const animal = trackerData.animals[animalId];

    let foundThisVariant = false;
    let wasThisVariantLastTier: boolean;
    // Search tiers from the top
    for (const tier of animal.variantTiers.toReversed()) {
      wasThisVariantLastTier = foundThisVariant;
      for (const vid of Object.keys(tier)) {
        // If we find a completed one, this tier is unredacted
        if (completedVariants.has(vid as AnimalVariantId)) return false;
        // If we find this variant, set a flag, and only check one more tier down
        if (vid === variantId) foundThisVariant = true;
      }
      if (wasThisVariantLastTier) return true;
    }

    // Never found the desired variant on this animal
    // This shouldn't happen, but fail gracefully
    return true;
  }

  function isVariantVisible(variant: AnimalVariant, completed: boolean): boolean {
    if (!isVariantInScope(variant, completed)) return false;
    return !completed || userState.state.showCompleted;
  }
  function sectionConfig(animalId: AnimalId): AnimalSubcategorySectionConfig<AnimalVariantId> {
    let displayableCompletedItemCount = 0;
    let displayableItemCount = 0;
    let visibleItems: VariantRowConfig[] = [];
    forEachVariant(animalId, ([vid, variant], tier) => {
      const completed = hasCompletedVariant(animalId, vid);
      if (!isVariantInScope(variant, completed)) return;
      displayableItemCount++;
      if (completed) displayableCompletedItemCount++;

      if (!completed || userState.state.showCompleted) {
        const totalTiers = trackerData.animals[animalId].variantTiers.length;
        visibleItems.push({
          completed,
          id: vid,
          name: variant.name,
          redacted: isVariantSpoilered(animalId, vid),
          season: getVariantSeason(variant),
          sources: [variant.source],
          subtitle: totalTiers > 1 ? `Tier ${(tier + 1).toString()}` : undefined,
          tier,
        });
      }
    });
    visibleItems.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;

      const orderA = SEASON_ORDER[a.season ?? "winter"];
      const orderB = SEASON_ORDER[b.season ?? "winter"];
      if (orderA !== orderB) return orderA - orderB;

      return a.name.localeCompare(b.name);
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
  }: {
    areAllAnimalsComplete: () => boolean;
    isAnimalComplete: (animalId: AnimalId) => boolean;
    isSpeciesVisible: (animalId: AnimalId) => boolean;
  } = $props();
</script>

<AnimalSubcategory
  {areAllAnimalsComplete}
  completionCheck={hasCompletedVariant}
  hasDisplayableItem={hasDisplayableVariant}
  {isAnimalComplete}
  name="Color Variants"
  {sectionConfig}
  toggleCompletion={(animalId: AnimalId, variantId: AnimalVariantId) => {
    userState.toggleAnimalVariant(animalId, variantId);
  }}
/>
