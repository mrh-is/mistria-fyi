<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import ConfirmSpoilerDialog from "$lib/components/confirm-spoiler-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isItemDimmed, isRowVisible, shouldCountItem } from "$lib/engine/availability.js";
  import { isEntityNameVisible, isVisible } from "$lib/engine/visibility.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordEntries, recordValues } from "$lib/utils";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";
  import { createSpoilerGuard } from "$lib/utils/spoiler-guard.svelte.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import AllCompleted from "./all-completed.svelte";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { Source } from "$lib/types/acquisition";
  import type {
    Item,
    ItemId,
    MuseumWing,
    MuseumWingId,
    MuseumWingSet,
    MuseumWingSetId,
  } from "$lib/types/tracker-data.js";

  const spoilerGuard = createSpoilerGuard();

  function itemNameVisible(itemId: ItemId): boolean {
    const visibility = trackerData.items[itemId].visibility;
    return isEntityNameVisible(visibility, userState.progressionState);
  }

  let redactedStoreIds = $derived(
    new Set(
      recordEntries(trackerData.stores)
        .filter(
          ([, { visibility }]) => visibility && !isVisible(visibility, userState.progressionState),
        )
        .map(([id]) => id),
    ),
  );

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds));

  function rowDisplay(itemId: ItemId, sources: Source[]): TrackerRowDisplay {
    const completed = userState.state.completed.museum.has(itemId);
    if (!itemNameVisible(itemId)) return { mode: "spoilered" };
    if (completed) return { leaving: recentlyCompleted.has(itemId), mode: "completed" };
    return {
      dimmed: isItemDimmed(
        sources,
        completed,
        userState.state.worldState,
        userState.state.availabilityMode,
      ),
      mode: "visible",
    };
  }

  let recentlyCompleted = new SvelteSet<ItemId>();

  function markLeaving(itemId: ItemId): void {
    recentlyCompleted.add(itemId);
    setTimeout(() => recentlyCompleted.delete(itemId), 1050);
  }

  function isItemComplete(itemId: ItemId): boolean {
    return userState.state.completed.museum.has(itemId);
  }

  function isWingComplete(wing: MuseumWing): boolean {
    return recordValues(wing.sets).every(isSetComplete);
  }

  function isMuseumComplete(): boolean {
    return recordValues(trackerData.museum).every(isWingComplete);
  }

  function isSetComplete(set: MuseumWingSet): boolean {
    return set.items.every(isItemComplete);
  }

  let nameFilter = $derived(toolbarState.searchQuery);

  function matchesFilter(itemId: ItemId): boolean {
    if (!nameFilter) return true;
    const name = trackerData.items[itemId].name;
    return name ? name.toLowerCase().includes(nameFilter.toLowerCase()) : false;
  }

  function isItemScoped(itemId: ItemId): boolean {
    if (!matchesFilter(itemId)) return false;
    return shouldCountItem(
      trackerData.items[itemId].sources,
      isItemComplete(itemId),
      userState.state.worldState,
      userState.state.availabilityMode,
    );
  }

  function isItemVisible(itemId: ItemId): boolean {
    if (!isItemScoped(itemId)) return false;
    return isRowVisible(
      itemId,
      isItemComplete(itemId),
      userState.state.showCompleted,
      recentlyCompleted,
    );
  }

  interface WingConfig {
    isVisible: boolean;
    scopedCompletedItemCount: number;
    scopedItemCount: number;
    setConfigs: (SetConfig & { setId: MuseumWingSetId })[];
  }
  function wingConfig(wing: MuseumWing): WingConfig {
    const setConfigs = recordEntries(wing.sets)
      .map(([id, set]) => {
        return { setId: id, ...setConfig(set) };
      })
      .filter(({ visibleItems }) => visibleItems.length > 0);
    return {
      isVisible: setConfigs.length > 0,
      scopedCompletedItemCount: setConfigs.reduce(
        (sum, { scopedCompletedItemCount }) => sum + scopedCompletedItemCount,
        0,
      ),
      scopedItemCount: setConfigs.reduce((sum, { scopedItemCount }) => sum + scopedItemCount, 0),
      setConfigs,
    };
  }

  interface SetConfig {
    name: string;
    scopedCompletedItemCount: number;
    scopedItemCount: number;
    visibleItems: (Item & { itemId: ItemId })[];
  }
  function setConfig(set: MuseumWingSet): SetConfig {
    return {
      name: set.name,
      scopedCompletedItemCount: set.items.filter(
        (itemId) => isItemScoped(itemId) && isItemComplete(itemId),
      ).length,
      scopedItemCount: set.items.filter(isItemScoped).length,
      visibleItems: set.items.filter(isItemVisible).map((itemId) => {
        return { itemId, ...trackerData.items[itemId] };
      }),
    };
  }

  function toggleItem(itemId: ItemId, setId: MuseumWingSetId, wingId: MuseumWingId): void {
    userState.toggleMuseumItem(itemId);
    const completed = isItemComplete(itemId);
    const item = trackerData.items[itemId];
    showUndoToast(item.name, completed, () => {
      userState.toggleMuseumItem(itemId);
    });
    if (completed) {
      if (!userState.state.showCompleted) markLeaving(itemId);
      if (isMuseumComplete()) {
        celebrateCategory();
      } else if (isWingComplete(trackerData.museum[wingId])) {
        celebrate();
      } else if (isSetComplete(trackerData.museum[wingId].sets[setId])) {
        celebrate();
      }
    }
  }
</script>

{#if spoilerGuard.condition}
  <ConfirmSpoilerDialog
    condition={spoilerGuard.condition}
    bind:open={spoilerGuard.open}
    onCancel={() => {
      spoilerGuard.cancel();
    }}
    onComplete={() => {
      spoilerGuard.complete();
    }}
    onCompleteAndUpdate={() => {
      spoilerGuard.completeAndUpdate();
    }}
  />
{/if}

{#each recordEntries(trackerData.museum) as [wingId, wing] (wingId)}
  {@const config = wingConfig(wing)}
  {#if config.isVisible}
    <ExpandableSection
      count={config.scopedCompletedItemCount}
      forceOpen={!!nameFilter}
      name={wing.name}
      total={config.scopedItemCount}
    >
      {#each config.setConfigs as set (set.setId)}
        <ExpandableSection
          count={set.scopedCompletedItemCount}
          forceOpen={!!nameFilter}
          name={set.name}
          total={set.scopedItemCount}
        >
          {#each set.visibleItems as item (item.itemId)}
            {@const itemId = item.itemId}
            {@const museumCompleted = isItemComplete(itemId)}
            {@const museumItemSources = trackerData.items[itemId].sources}
            {@const museumItemVisibility = trackerData.items[itemId].visibility}
            <TrackerRow
              display={rowDisplay(itemId, museumItemSources)}
              lookups={{ ...baseLookups, entityVisibility: museumItemVisibility }}
              name={trackerData.items[itemId].name}
              sources={museumItemSources}
              onToggle={() => {
                if (itemNameVisible(itemId) || museumCompleted) {
                  toggleItem(itemId, set.setId, wingId);
                } else {
                  spoilerGuard.guard(museumItemVisibility, () => {
                    toggleItem(itemId, set.setId, wingId);
                  });
                }
              }}
            />
          {/each}
        </ExpandableSection>
      {/each}
    </ExpandableSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isMuseumComplete()} />
