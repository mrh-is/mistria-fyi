<script lang="ts">
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { isCategoryComplete } from "#lib/engine/progress.js";
  import { isEntityNameVisible } from "#lib/engine/visibility.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import AllCompleted from "./all-completed.svelte";
  import AnimalCosmeticsSection from "./animal-cosmetics-section.svelte";
  import AnimalVariantsSection from "./animal-variants-section.svelte";
  import PetCollectiblesSection from "./pet-collectibles-section.svelte";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type {
    AnimalId,
    AnimalVariant,
    AnimalVariantId,
    CosmeticId,
  } from "#lib/types/tracker-data.js";

  let { locale }: { locale: LocaleCode } = $props();

  function areAllAnimalsComplete(): boolean {
    return isCategoryComplete("animals", userState.state);
  }

  function hasCompletedCosmetic(animalId: AnimalId, cosmeticId: CosmeticId): boolean {
    return userState.state.completed.animalCosmetics[animalId]?.has(cosmeticId) ?? false;
  }

  function hasCompletedVariant(animalId: AnimalId, variantId: AnimalVariantId): boolean {
    return userState.state.completed.animals[animalId]?.has(variantId) ?? false;
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
    return isEntityNameVisible(visibility, userState.progressionState);
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

<AnimalVariantsSection {areAllAnimalsComplete} {isAnimalComplete} {isSpeciesVisible} {locale} />

<AnimalCosmeticsSection {areAllAnimalsComplete} {isAnimalComplete} {isSpeciesVisible} {locale} />

<PetCollectiblesSection {areAllAnimalsComplete} {locale} />

<AllCompleted isAllCompleted={areAllAnimalsComplete()} />
