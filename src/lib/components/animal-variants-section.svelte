<script lang="ts">
  import AnimalSubcategory from "#lib/components/animal-subcategory.svelte";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { animalNameId, getName, nameCollator } from "#lib/data/names.js";
  import { getVariantSeason, isAnimalVariantSpoilered } from "#lib/engine/animal-availability.js";
  import { projectAnimals } from "#lib/engine/projections/animals.js";
  import { countShelfRows, filteredCounts } from "#lib/engine/shelves.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { recordKeys } from "#lib/utils/record.js";

  import type {
    AnimalSubcategoryRowProps,
    AnimalSubcategorySectionConfig,
  } from "#lib/components/animal-subcategory.types.js";
  import type { ShelfRow } from "#lib/engine/shelves.js";
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
    return someVariant(animalId, ([variantId]) => {
      const facts = variantFacts(animalId, variantId);
      return matchesSearch(animalId, variantId) && facts.shown;
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

  let factsByVariant = $derived(
    new Map(
      projectAnimals(userState.progressContext, {
        showsSource: toolbarState.showsSource,
      }).rows.flatMap((row) =>
        row.kind === "variant" ? [[`${row.animalId}:${row.variantId}`, row]] : [],
      ) as [string, ShelfRow][],
    ),
  );

  function variantFacts(animalId: AnimalId, variantId: AnimalVariantId): ShelfRow {
    const facts = factsByVariant.get(`${animalId}:${variantId}`);
    if (!facts) throw new Error(`Variant without a projection: ${animalId}:${variantId}`);
    return facts;
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

  function sectionConfig(animalId: AnimalId): AnimalSubcategorySectionConfig<AnimalVariantId> {
    const everyRow: ShelfRow[] = [];
    const matchingRows: ShelfRow[] = [];
    const visibleItems: VariantRowConfig[] = [];
    forEachVariant(animalId, ([vid, variant], tier) => {
      const facts = variantFacts(animalId, vid);
      everyRow.push(facts);
      if (!matchesSearch(animalId, vid)) return;
      matchingRows.push(facts);
      if (!facts.shown) return;
      const totalTiers = trackerData.animals[animalId].variantTiers.length;
      visibleItems.push({
        ...facts,
        id: vid,
        name: getName("animals", animalNameId(animalId, "variants", vid), locale),
        season: getVariantSeason(variant),
        sources: [variant.source],
        spoilered: isVariantSpoilered(animalId, vid),
        subtitle:
          totalTiers > 1 ? getName("ui", `tier_${(tier + 1).toString()}`, locale) : undefined,
        tier,
      });
    });
    visibleItems.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;

      const orderA = SEASON_ORDER[a.season ?? "winter"];
      const orderB = SEASON_ORDER[b.season ?? "winter"];
      if (orderA !== orderB) return orderA - orderB;

      return nameCollator(locale).compare(a.name, b.name);
    });
    return {
      displayableItemCount: visibleItems.length,
      isVisible: isSpeciesVisible(animalId),
      matchingRows,
      progress: countShelfRows(everyRow),
      visibleItems,
    };
  }

  let {
    isAnimalComplete,
    isSpeciesVisible,
    locale,
  }: {
    isAnimalComplete: (animalId: AnimalId) => boolean;
    isSpeciesVisible: (animalId: AnimalId) => boolean;
    locale: LocaleCode;
  } = $props();

  registerPageSearch(() => {
    const configs = recordKeys(trackerData.animals).map((animalId) => sectionConfig(animalId));
    return {
      filtered: filteredCounts(configs.flatMap(({ matchingRows }) => matchingRows)),
      visible: configs.reduce((sum, { visibleItems }) => sum + visibleItems.length, 0),
    };
  });
</script>

<AnimalSubcategory
  factField="animals"
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
