<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import ConfirmSpoilerDialog from "#lib/components/confirm-spoiler-dialog.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import TrackerRowStack from "#lib/components/tracker-row-stack.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { isItemDimmed, isRowVisible, shouldCountItem } from "#lib/engine/availability.js";
  import { isEntityNameVisible, isVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { recordEntries, recordValues } from "#lib/utils.js";
  import { celebrate, celebrateCategory } from "#lib/utils/celebrate.js";
  import { buildBaseSegmentLookups } from "#lib/utils/segment-lookups.js";
  import { registerSourceFilters } from "#lib/utils/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/utils/spoiler-guard.svelte.js";
  import { showUndoToast } from "#lib/utils/undo-toast.js";

  import AllCompleted from "./all-completed.svelte";

  import type { TrackerRowDisplay } from "#lib/components/tracker-row.svelte";
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

  let { locale }: { locale: LocaleCode } = $props();

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

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds, locale));

  function rowDisplay(itemId: ItemId, sources: Source[]): TrackerRowDisplay {
    const completed = userState.state.completed.museum.has(itemId);
    if (!itemNameVisible(itemId)) return { mode: "spoilered" };
    if (completed) return { leaving: recentlyCompleted.has(itemId), mode: "completed" };
    return {
      dimmed: isItemDimmed(
        sources,
        completed,
        userState.state.worldState,
        userState.state.availabilityWindows,
      ),
      mode: "visible",
    };
  }

  let recentlyCompleted = new SvelteSet<ItemId>();

  function isItemComplete(itemId: ItemId): boolean {
    return userState.state.completed.museum.has(itemId);
  }

  function isMuseumComplete(): boolean {
    return recordValues(trackerData.museum).every((wing) => isWingComplete(wing));
  }

  function isSetComplete(set: MuseumWingSet): boolean {
    return set.items.every((itemId) => isItemComplete(itemId));
  }

  function isWingComplete(wing: MuseumWing): boolean {
    return recordValues(wing.sets).every((set) => isSetComplete(set));
  }

  function markLeaving(itemId: ItemId): void {
    recentlyCompleted.add(itemId);
    setTimeout(() => recentlyCompleted.delete(itemId), 1050);
  }

  let nameFilter = $derived(toolbarState.searchQuery);

  registerSourceFilters("museum", () => trackerIndex.categorySourceTypes.museum);

  interface SetConfig {
    baseItemCount: number;
    name: string;
    scopedCompletedItemCount: number;
    scopedItemCount: number;
    visibleItems: (Item & { itemId: ItemId })[];
  }

  interface WingConfig {
    baseItemCount: number;
    isVisible: boolean;
    scopedCompletedItemCount: number;
    scopedItemCount: number;
    setConfigs: (SetConfig & { setId: MuseumWingSetId })[];
  }

  function isItemBaseScoped(itemId: ItemId): boolean {
    if (!matchesFilter(itemId)) return false;
    return shouldCountItem(
      trackerData.items[itemId].sources,
      isItemComplete(itemId),
      userState.state.worldState,
      userState.state.availabilityWindows,
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
      userState.state.showCompleted,
      recentlyCompleted,
    );
  }
  function matchesFilter(itemId: ItemId): boolean {
    if (!nameFilter) return true;
    if (!itemNameVisible(itemId)) return false;
    return getName("items", itemId, locale).toLowerCase().includes(nameFilter.toLowerCase());
  }

  function setConfig(wingId: MuseumWingId, setId: MuseumWingSetId, set: MuseumWingSet): SetConfig {
    return {
      baseItemCount: set.items.filter(isItemBaseScoped).length,
      name: getName("museum_wings", `${wingId}/sets/${setId}`, locale),
      scopedCompletedItemCount: set.items.filter(
        (itemId) => isItemScoped(itemId) && isItemComplete(itemId),
      ).length,
      scopedItemCount: set.items.filter(isItemScoped).length,
      visibleItems: set.items
        .filter(isItemVisible)
        .map((itemId) => ({ itemId, ...trackerData.items[itemId] })),
    };
  }
  function toggleItem(itemId: ItemId, setId: MuseumWingSetId, wingId: MuseumWingId): void {
    userState.toggleMuseumItem(itemId);
    const completed = isItemComplete(itemId);
    showUndoToast(getName("items", itemId, locale), completed, () => {
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

  function wingConfig(wingId: MuseumWingId, wing: MuseumWing): WingConfig {
    const setConfigs = recordEntries(wing.sets)
      .map(([id, set]) => ({ setId: id, ...setConfig(wingId, id, set) }))
      .filter(({ baseItemCount }) => baseItemCount > 0);
    return {
      baseItemCount: setConfigs.reduce((sum, { baseItemCount }) => sum + baseItemCount, 0),
      isVisible: setConfigs.some(({ baseItemCount }) => baseItemCount > 0),
      scopedCompletedItemCount: setConfigs.reduce(
        (sum, { scopedCompletedItemCount }) => sum + scopedCompletedItemCount,
        0,
      ),
      scopedItemCount: setConfigs.reduce((sum, { scopedItemCount }) => sum + scopedItemCount, 0),
      setConfigs,
    };
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
  {@const config = wingConfig(wingId, wing)}
  {#if config.isVisible}
    <ExpandableSection
      count={config.scopedCompletedItemCount}
      forceOpen={!!nameFilter}
      name={getName("museum_wings", wingId, locale)}
      reportCategory="museum wing"
      reportEntityId={wingId}
      total={config.scopedItemCount}
    >
      {#each config.setConfigs as set (set.setId)}
        <ExpandableSection
          depth={1}
          count={set.scopedCompletedItemCount}
          forceOpen={!!nameFilter}
          name={set.name}
          reportCategory="museum set"
          reportEntityId={set.setId}
          total={set.scopedItemCount}
        >
          <TrackerRowStack>
            {#each set.visibleItems as item (item.itemId)}
              {@const itemId = item.itemId}
              {@const museumCompleted = isItemComplete(itemId)}
              {@const museumItemSources = trackerData.items[itemId].sources}
              {@const museumItemVisibility = trackerData.items[itemId].visibility}
              <TrackerRow
                display={rowDisplay(itemId, museumItemSources)}
                lookups={{ ...baseLookups, entityVisibility: museumItemVisibility }}
                name={getName("items", itemId, locale)}
                reportCategory="museum item"
                reportEntityId={itemId}
                sources={museumItemSources}
                sprite={itemId}
                spriteClass="text-cat-museum"
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
          </TrackerRowStack>
          {#if set.visibleItems.length === 0}
            <p class="py-4 text-center text-sm text-muted-foreground">
              {m.no_items_match_filters()}
            </p>
          {/if}
        </ExpandableSection>
      {/each}
    </ExpandableSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isMuseumComplete()} />
