<script lang="ts">
  import AllCompleted from "#lib/components/all-completed.svelte";
  import SectionGroups from "#lib/components/section-groups.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRowSection from "#lib/components/tracker-row-section.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { createCheckOff } from "#lib/controllers/check-off.svelte.js";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { trackerIndex } from "#lib/data/index.js";
  import { getAlmanacEntryVariant } from "#lib/data/item-variants.js";
  import { getAlmanacEntryNames, getName, nameCollator } from "#lib/data/names.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { projectAlmanac } from "#lib/engine/projections/almanac.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { filteredCounts, rowShelf } from "#lib/engine/shelves.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName, matchesTerms } from "#lib/utils/name-match.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { AlmanacCategoryId, AlmanacEntry, ItemId } from "#lib/types/tracker-data.js";

  let { locale }: { locale: LocaleCode } = $props();

  function isItemCompleted(itemId: ItemId): boolean {
    return userState.state.progress.almanac.has(itemId);
  }

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));

  const sectionGrouping = createSectionGrouping<AlmanacCategoryId>();
  const checkOff = createCheckOff<ItemId, AlmanacCategoryId>({
    category: "almanac",
    grouping: sectionGrouping,
    isCompleted: isItemCompleted,
    toggle: (id) => {
      userState.toggleAlmanacItem(id);
    },
  });

  function isAlmanacComplete(): boolean {
    return isCategoryComplete("almanac", userState.progressContext);
  }

  let nameFilter = $derived(toolbarState.searchQuery);

  registerSourceFilters("almanac", () => trackerIndex.categorySourceTypes.almanac);

  function matchesEntry(entry: AlmanacEntry): boolean {
    const names = getAlmanacEntryNames(entry, locale);
    const variant = getAlmanacEntryVariant(entry, locale);
    return (
      names.some((name) => matchesName(name, nameFilter, locale)) ||
      matchesTerms(names, variant ? [variant] : [], nameFilter, locale)
    );
  }

  let projection = $derived(
    projectAlmanac(userState.progressContext, {
      hideSpoilered: Boolean(nameFilter),
      matchesEntry,
      progressionState: userState.progressionState,
      showsSource: toolbarState.showsSource,
      showUnobtainable: toolbarState.showUnobtainable,
    }),
  );

  registerPageSearch(() => ({
    filtered: filteredCounts(projection.rows.filter((row) => row.matchesSearch)),
    visible: projection.rows.filter((row) => row.visible).length,
  }));

  let sectionViews = $derived(
    projection.sections.map((section) => ({
      ...section,
      visibleRows: section.visibleRows
        .map((row) => ({
          ...row,
          name: getAlmanacEntryNames(row.entry, locale)[0],
          variant: getAlmanacEntryVariant(row.entry, locale),
        }))
        .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
    })),
  );
</script>

<SpoilerGuardDialog guard={checkOff.guard} />

<SectionGroups
  forceOpen={!!nameFilter}
  getKey={(view) => view.id}
  grouping={sectionGrouping}
  items={sectionViews}
>
  {#snippet section({ canonicalIds, id, progress, visibleRows })}
    {#if !nameFilter || visibleRows.length > 0}
      <TrackerRowSection
        {locale}
        forceOpen={!!nameFilter}
        name={getName("ui", id, locale)}
        reportCategory="almanac"
        reportEntityId={id}
        {progress}
        forceShelvesOpen={!!nameFilter}
        getKey={(item) => item.canonicalId}
        getShelf={rowShelf}
        isLeaving={(item) => checkOff.isLeaving(item.canonicalId)}
        items={visibleRows}
      >
        {#snippet row(row)}
          {@const { canonicalId, item, name, sources, variant } = row}
          {@const itemVisibility = item.visibility}
          <TrackerRow
            fact={factKey("almanac", canonicalId)}
            display={checkOff.rowDisplay(canonicalId, itemVisibility)}
            segmentLookups={{ ...baseLookups, entityVisibility: itemVisibility }}
            {name}
            subtitle={variant}
            {variant}
            reportCategory="almanac-item"
            reportEntityId={canonicalId}
            {sources}
            sprite={canonicalId}
            spriteClass="text-(--color-category-almanac)"
            onToggle={(covered) => {
              checkOff.onToggle(
                {
                  id: canonicalId,
                  name,
                  sectionChecks: [() => canonicalIds.every((itemId) => isItemCompleted(itemId))],
                  sectionKey: id,
                  visibility: itemVisibility,
                },
                covered,
              );
            }}
          />
        {/snippet}
      </TrackerRowSection>
    {/if}
  {/snippet}
</SectionGroups>

<AllCompleted isAllCompleted={isAlmanacComplete()} />
