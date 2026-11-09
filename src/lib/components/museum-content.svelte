<script lang="ts">
  import AllCompleted from "#lib/components/all-completed.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SectionGroups from "#lib/components/section-groups.svelte";
  import ShelfGroups from "#lib/components/shelf-groups.svelte";
  import ShelfRows from "#lib/components/shelf-rows.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { createCheckOff } from "#lib/controllers/check-off.svelte.js";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { projectMuseum } from "#lib/engine/projections/museum.js";
  import { factKey } from "#lib/engine/provenance.js";
  import {
    addProgress,
    countShelfRows,
    filteredCounts,
    progressShelf,
    rowShelf,
  } from "#lib/engine/shelves.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { recordEntries, recordValues } from "#lib/utils/record.js";

  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { MuseumRow } from "#lib/engine/projections/museum.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type {
    ItemId,
    MuseumWing,
    MuseumWingId,
    MuseumWingSet,
    MuseumWingSetId,
  } from "#lib/types/tracker-data.js";

  let { locale }: { locale: LocaleCode } = $props();

  function isItemSpoilered(itemId: ItemId): boolean {
    const visibility = trackerData.items[itemId].visibility;
    return !isConditionVisible(visibility, userState.progressionState);
  }

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));

  const sectionGrouping = createSectionGrouping<MuseumWingId>();
  const checkOff = createCheckOff<ItemId, MuseumWingId>({
    category: "museum",
    grouping: sectionGrouping,
    isCompleted: isItemComplete,
    toggle: (id) => {
      userState.toggleMuseumItem(id);
    },
  });

  function isItemComplete(itemId: ItemId): boolean {
    return userState.state.progress.museum.has(itemId);
  }

  function isMuseumComplete(): boolean {
    return isCategoryComplete("museum", userState.progressContext);
  }

  function isSetComplete(set: MuseumWingSet): boolean {
    return set.items.every((itemId) => isItemComplete(itemId));
  }

  function isWingComplete(wing: MuseumWing): boolean {
    return recordValues(wing.sets).every((set) => isSetComplete(set));
  }

  let nameFilter = $derived(toolbarState.searchQuery);

  registerSourceFilters("museum", () => trackerIndex.categorySourceTypes.museum);

  interface SetConfig {
    name: string;
    progress: CategoryProgress;
    visibleRows: MuseumRow[];
  }

  interface WingConfig {
    isVisible: boolean;
    progress: CategoryProgress;
    setConfigs: (SetConfig & { setId: MuseumWingSetId })[];
  }

  let projection = $derived(
    projectMuseum(userState.progressContext, {
      progressionState: userState.progressionState,
      showsSource: toolbarState.showsSource,
    }),
  );

  function matchesFilter(itemId: ItemId): boolean {
    if (!nameFilter) return true;
    if (isItemSpoilered(itemId)) return false;
    return matchesName(getName("items", itemId, locale), nameFilter, locale);
  }

  function setConfig(wingId: MuseumWingId, setId: MuseumWingSetId): SetConfig {
    const rows = projection.rows.filter((row) => row.wingId === wingId && row.setId === setId);
    return {
      name: getName("museum_wings", `${wingId}/sets/${setId}`, locale),
      // Every obtainable item in the set, whatever the page shows, as the page header counts them.
      progress: countShelfRows(rows.filter((row) => row.obtainable)),
      visibleRows: rows.filter((row) => row.shown && matchesFilter(row.id)),
    };
  }

  function wingConfig(wingId: MuseumWingId, wing: MuseumWing): WingConfig {
    const allSets = recordEntries(wing.sets).map(([id]) => ({
      setId: id,
      ...setConfig(wingId, id),
    }));
    const setConfigs = allSets.filter(({ progress, visibleRows }) =>
      nameFilter ? visibleRows.length > 0 : progressShelf(progress) !== undefined,
    );
    return {
      isVisible: setConfigs.length > 0,
      progress: addProgress(allSets.map(({ progress }) => progress)),
      setConfigs,
    };
  }

  let wingViews = $derived(
    recordEntries(trackerData.museum).map(([wingId, wing]) => ({
      config: wingConfig(wingId, wing),
      wingId,
    })),
  );

  registerPageSearch(() => {
    // An item can sit in several sets, but it's still one match.
    const rows = [...new Map(projection.rows.map((row) => [row.id, row])).values()];
    const matching = rows.filter((row) => matchesFilter(row.id));
    return {
      filtered: filteredCounts(matching),
      visible: matching.filter((row) => row.shown).length,
    };
  });
</script>

<SpoilerGuardDialog guard={checkOff.guard} />

<SectionGroups
  forceOpen={!!nameFilter}
  getKey={(view) => view.wingId}
  grouping={sectionGrouping}
  items={wingViews}
>
  {#snippet section({ config, wingId })}
    {#if config.isVisible}
      <ExpandableSection
        {locale}
        forceOpen={!!nameFilter}
        name={getName("museum_wings", wingId, locale)}
        progress={config.progress}
        reportCategory="museum-wing"
        reportEntityId={wingId}
      >
        <ShelfGroups
          forceOpen={!!nameFilter}
          getKey={(set) => set.setId}
          getShelf={(set) => progressShelf(set.progress) ?? "completed"}
          items={config.setConfigs}
        >
          {#snippet group(sets)}
            {#each sets as set (set.setId)}
              <ExpandableSection
                {locale}
                depth={1}
                forceOpen={!!nameFilter}
                name={set.name}
                progress={set.progress}
                reportCategory="museum-set"
                reportEntityId={set.setId}
              >
                <ShelfRows
                  forceOpen={!!nameFilter}
                  level={4}
                  getKey={(row) => row.id}
                  getShelf={rowShelf}
                  isLeaving={(row) => checkOff.isLeaving(row.id)}
                  items={set.visibleRows}
                >
                  {#snippet row({ id: itemId })}
                    {@const museumItemSources = trackerData.items[itemId].sources}
                    {@const museumItemVisibility = trackerData.items[itemId].visibility}
                    <TrackerRow
                      fact={factKey("museum", itemId)}
                      display={checkOff.rowDisplay(itemId, museumItemVisibility)}
                      segmentLookups={{ ...baseLookups, entityVisibility: museumItemVisibility }}
                      name={getName("items", itemId, locale)}
                      reportCategory="museum-item"
                      reportEntityId={itemId}
                      sources={museumItemSources}
                      sprite={itemId}
                      spriteClass="text-(--color-category-museum)"
                      onToggle={(covered) => {
                        const wing = trackerData.museum[wingId];
                        checkOff.onToggle(
                          {
                            id: itemId,
                            name: getName("items", itemId, locale),
                            sectionChecks: [
                              () => isWingComplete(wing),
                              () => isSetComplete(wing.sets[set.setId]),
                            ],
                            sectionKey: wingId,
                            visibility: museumItemVisibility,
                          },
                          covered,
                        );
                      }}
                    />
                  {/snippet}
                </ShelfRows>
              </ExpandableSection>
            {/each}
          {/snippet}
        </ShelfGroups>
      </ExpandableSection>
    {/if}
  {/snippet}
</SectionGroups>

<AllCompleted isAllCompleted={isMuseumComplete()} />
