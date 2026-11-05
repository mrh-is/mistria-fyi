<script lang="ts">
  import AllCompleted from "#lib/components/all-completed.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SectionGroups from "#lib/components/section-groups.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { createLeavingSet } from "#lib/controllers/leaving-set.svelte.js";
  import {
    registerPageSearch,
    showsCompletedRows,
    visibleWindows,
  } from "#lib/controllers/page-search.svelte.js";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { isItemObtainable } from "#lib/engine/applicability.js";
  import {
    isInProgressScope,
    isItemAvailable,
    isItemDimmed,
    isRowVisible,
  } from "#lib/engine/availability.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { addProgress, countProgress } from "#lib/presentation/progress-scope.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { recordEntries, recordValues } from "#lib/utils/record.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { Source } from "#lib/types/acquisition.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type {
    Item,
    ItemId,
    MuseumWing,
    MuseumWingId,
    MuseumWingSet,
    MuseumWingSetId,
  } from "#lib/types/tracker-data.js";
  import type { TrackerRowDisplay } from "#lib/utils/row-display.js";

  let { locale }: { locale: LocaleCode } = $props();

  const spoilerGuard = createSpoilerGuard();

  function isItemSpoilered(itemId: ItemId): boolean {
    const visibility = trackerData.items[itemId].visibility;
    return !isConditionVisible(visibility, userState.progressionState);
  }

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));

  function rowDisplay(itemId: ItemId, sources: Source[]): TrackerRowDisplay {
    const completed = userState.state.progress.museum.has(itemId);
    return trackerRowDisplay({
      completed,
      dimmed: isItemDimmed(
        { sources, visibility: trackerData.items[itemId].visibility },
        completed,
        userState.progressContext,
        visibleWindows(),
      ),
      leaving: recentlyCompleted.has(itemId),
      spoilered: isItemSpoilered(itemId),
    });
  }

  const recentlyCompleted = createLeavingSet<ItemId>();
  const sectionGrouping = createSectionGrouping<MuseumWingId>();

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
    baseItemCount: number;
    name: string;
    progress: CategoryProgress;
    visibleItems: (Item & { itemId: ItemId })[];
  }

  interface WingConfig {
    baseItemCount: number;
    isVisible: boolean;
    progress: CategoryProgress;
    setConfigs: (SetConfig & { setId: MuseumWingSetId })[];
  }

  function isItemBaseScoped(itemId: ItemId): boolean {
    if (!matchesFilter(itemId)) return false;
    return isInProgressScope(
      trackerData.items[itemId],
      isItemComplete(itemId),
      userState.progressContext,
      visibleWindows(),
    );
  }

  function isItemScoped(itemId: ItemId): boolean {
    return (
      isItemBaseScoped(itemId) &&
      toolbarState.matchesSourceFilters(trackerData.items[itemId].sources)
    );
  }

  function isItemVisible(itemId: ItemId): boolean {
    if (!isItemScoped(itemId)) return false;
    return isRowVisible(
      itemId,
      isItemComplete(itemId),
      showsCompletedRows(),
      recentlyCompleted.ids,
    );
  }
  function matchesFilter(itemId: ItemId): boolean {
    if (!nameFilter) return true;
    if (isItemSpoilered(itemId)) return false;
    return matchesName(getName("items", itemId, locale), nameFilter, locale);
  }

  /** Every obtainable item in the set, whatever the page shows, as the page header counts them. */
  function setProgress(set: MuseumWingSet): CategoryProgress {
    return countProgress(
      set.items.filter((itemId) => isItemObtainable(itemId, userState.state.progress)),
      (itemId) => isItemComplete(itemId),
      (itemId) => {
        const item = trackerData.items[itemId];
        return (
          isItemAvailable(item, userState.progressContext, visibleWindows()) &&
          toolbarState.matchesSourceFilters(item.sources)
        );
      },
    );
  }

  function setConfig(wingId: MuseumWingId, setId: MuseumWingSetId, set: MuseumWingSet): SetConfig {
    return {
      baseItemCount: set.items.filter(isItemBaseScoped).length,
      name: getName("museum_wings", `${wingId}/sets/${setId}`, locale),
      progress: setProgress(set),
      visibleItems: set.items
        .filter(isItemVisible)
        .map((itemId) => ({ itemId, ...trackerData.items[itemId] })),
    };
  }
  function toggleItem(itemId: ItemId, setId: MuseumWingSetId, wingId: MuseumWingId): void {
    sectionGrouping.hold(wingId);
    userState.toggleMuseumItem(itemId);
    const completed = isItemComplete(itemId);
    showUndoToast(getName("items", itemId, locale), completed, () => {
      userState.toggleMuseumItem(itemId);
    });
    if (completed) {
      if (!userState.state.showCompleted) recentlyCompleted.markLeaving(itemId);
      if (isMuseumComplete()) {
        celebrateCategory();
      } else if (isWingComplete(trackerData.museum[wingId])) {
        celebrate();
      } else if (isSetComplete(trackerData.museum[wingId].sets[setId])) {
        celebrate();
      }
    }
  }

  function wingConfig(wingId: MuseumWingId, wing: MuseumWing): WingConfig {
    const setConfigs = recordEntries(wing.sets)
      .map(([id, set]) => ({ setId: id, ...setConfig(wingId, id, set) }))
      .filter(
        ({ baseItemCount, visibleItems }) =>
          baseItemCount > 0 && (!nameFilter || visibleItems.length > 0),
      );
    return {
      baseItemCount: setConfigs.reduce((sum, { baseItemCount }) => sum + baseItemCount, 0),
      isVisible: setConfigs.length > 0,
      progress: addProgress(recordValues(wing.sets).map((set) => setProgress(set))),
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
    const itemIds = new Set(
      recordValues(trackerData.museum).flatMap((wing) =>
        recordValues(wing.sets).flatMap((set) => set.items),
      ),
    );
    return {
      matches: [...itemIds].filter((itemId) => matchesFilter(itemId)).length,
      visible: [...itemIds].filter((itemId) => isItemVisible(itemId)).length,
    };
  });
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

<SectionGroups getKey={(view) => view.wingId} grouping={sectionGrouping} items={wingViews}>
  {#snippet section({ config, wingId })}
    {#if config.isVisible}
      <ExpandableSection
        {locale}
        count={config.progress.completed}
        forceOpen={!!nameFilter}
        name={getName("museum_wings", wingId, locale)}
        reportCategory="museum-wing"
        reportEntityId={wingId}
        remaining={config.progress.remainingInScope}
        total={config.progress.total}
      >
        {#each config.setConfigs as set (set.setId)}
          <ExpandableSection
            {locale}
            depth={1}
            count={set.progress.completed}
            forceOpen={!!nameFilter}
            name={set.name}
            reportCategory="museum-set"
            reportEntityId={set.setId}
            remaining={set.progress.remainingInScope}
            total={set.progress.total}
          >
            <TrackerRowList getKey={(item) => item.itemId} items={set.visibleItems}>
              {#snippet row(item)}
                {@const itemId = item.itemId}
                {@const museumCompleted = isItemComplete(itemId)}
                {@const museumItemSources = trackerData.items[itemId].sources}
                {@const museumItemVisibility = trackerData.items[itemId].visibility}
                <TrackerRow
                  fact={factKey("museum", itemId)}
                  display={rowDisplay(itemId, museumItemSources)}
                  segmentLookups={{ ...baseLookups, entityVisibility: museumItemVisibility }}
                  name={getName("items", itemId, locale)}
                  reportCategory="museum-item"
                  reportEntityId={itemId}
                  sources={museumItemSources}
                  sprite={itemId}
                  spriteClass="text-(--color-category-museum)"
                  onToggle={() => {
                    if (!isItemSpoilered(itemId) || museumCompleted) {
                      toggleItem(itemId, set.setId, wingId);
                    } else {
                      spoilerGuard.requestGuardedAction(museumItemVisibility, () => {
                        toggleItem(itemId, set.setId, wingId);
                      });
                    }
                  }}
                />
              {/snippet}
            </TrackerRowList>
          </ExpandableSection>
        {/each}
      </ExpandableSection>
    {/if}
  {/snippet}
</SectionGroups>

<AllCompleted isAllCompleted={isMuseumComplete()} />
