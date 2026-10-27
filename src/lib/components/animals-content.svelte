<script lang="ts">
  import AllCompleted from "#lib/components/all-completed.svelte";
  import AnimalCosmeticsSection from "#lib/components/animal-cosmetics-section.svelte";
  import AnimalVariantsSection from "#lib/components/animal-variants-section.svelte";
  import MountAppearancesSection from "#lib/components/mount-appearances-section.svelte";
  import PetCollectiblesSection from "#lib/components/pet-collectibles-section.svelte";
  import SectionGroups from "#lib/components/section-groups.svelte";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type {
    AnimalId,
    AnimalVariant,
    AnimalVariantId,
    CosmeticId,
  } from "#lib/types/tracker-data.js";

  let { locale }: { locale: LocaleCode } = $props();

  const SECTION_KEYS = ["variants", "cosmetics", "mount", "pet-cosmetics", "pet-skins"] as const;

  // Each sub-section holds its own group on toggles, through the section's context.
  const sectionGrouping = createSectionGrouping<(typeof SECTION_KEYS)[number]>();

  function areAllAnimalsComplete(): boolean {
    return isCategoryComplete("animals", userState.progressContext);
  }

  function hasCompletedCosmetic(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    return userState.state.progress.animalCosmetics[animalId]?.has(cosmeticId) ?? false;
  }

  function hasCompletedVariant(animalId: AnimalId, variantId: AnimalVariantId): boolean {
    return userState.state.progress.animals[animalId]?.has(variantId) ?? false;
  }

  function isAnimalComplete(animalId: AnimalId): boolean {
    const someVariantIncomplete = someVariant(
      animalId,
      ([variantId]) => !hasCompletedVariant(animalId, variantId),
    );
    if (someVariantIncomplete) return false;

    const cosmeticIds = Object.keys(trackerData.animals[animalId].cosmetics) as CosmeticId[];
    return cosmeticIds.every((cosmeticId) => hasCompletedCosmetic(animalId, cosmeticId));
  }

  function isSpeciesVisible(animalId: AnimalId): boolean {
    const visibility = trackerData.animals[animalId].visibility;
    return isConditionVisible(visibility, userState.progressionState);
  }

  function someVariant(
    animalId: AnimalId,
    predicate: (value: [AnimalVariantId, AnimalVariant]) => boolean,
  ): boolean {
    return trackerData.animals[animalId].variantTiers.some((tier) =>
      (Object.entries(tier) as [AnimalVariantId, AnimalVariant][]).some((entry) =>
        predicate(entry),
      ),
    );
  }

  registerSourceFilters("animals", () => trackerIndex.categorySourceTypes.animals);
</script>

<SectionGroups getKey={(key) => key} grouping={sectionGrouping} items={SECTION_KEYS}>
  {#snippet section(key)}
    {#if key === "variants"}
      <AnimalVariantsSection
        {areAllAnimalsComplete}
        {isAnimalComplete}
        {isSpeciesVisible}
        {locale}
      />
    {:else if key === "cosmetics"}
      <AnimalCosmeticsSection
        {areAllAnimalsComplete}
        {isAnimalComplete}
        {isSpeciesVisible}
        {locale}
      />
    {:else if key === "mount"}
      <MountAppearancesSection {areAllAnimalsComplete} {locale} />
    {:else if key === "pet-cosmetics"}
      <PetCollectiblesSection {areAllAnimalsComplete} collection="cosmetics" {locale} />
    {:else}
      <PetCollectiblesSection {areAllAnimalsComplete} collection="skins" {locale} />
    {/if}
  {/snippet}
</SectionGroups>

<AllCompleted isAllCompleted={areAllAnimalsComplete()} />
