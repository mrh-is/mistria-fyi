<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import ConfirmRedactedDialog from "$lib/components/confirm-redacted-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isItemDimmed, isRowVisible, shouldCountItem } from "$lib/engine/availability.js";
  import { isEntityNameVisible, isVisible } from "$lib/engine/visibility.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { createRedactionGuard } from "$lib/utils/redaction-guard.svelte.js";
  import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { AcquisitionSource, ItemId } from "$lib/types/tracker-data.js";

  const redactGuard = createRedactionGuard();

  function itemNameVisible(itemId: ItemId): boolean {
    const visibility = trackerData.items[itemId].visibility ?? { type: "always" };
    return isEntityNameVisible(visibility, userState.progressionState);
  }

  let redactedStoreIds = $derived(
    new Set(
      Object.entries(trackerData.storeVisibility)
        .filter(([, vis]) => !isVisible(vis, userState.progressionState))
        .map(([id]) => id),
    ),
  );

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds));

  function rowDisplay(itemId: ItemId, sources: AcquisitionSource[]): TrackerRowDisplay {
    const completed = userState.state.completed.museum.has(itemId);
    if (!itemNameVisible(itemId)) return { mode: "redacted" };
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

  function isWingComplete(wingItems: ItemId[]): boolean {
    return wingItems.every((id) => userState.state.completed.museum.has(id));
  }

  function isCategoryComplete(): boolean {
    return trackerData.museum.every((wing) =>
      wing.sets.flatMap((s) => s.items).every((id) => userState.state.completed.museum.has(id)),
    );
  }

  function isSetComplete(items: ItemId[]): boolean {
    return items.every((id) => userState.state.completed.museum.has(id));
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
      trackerData.items[itemId].sources ?? [],
      userState.state.completed.museum.has(itemId),
      userState.state.worldState,
      userState.state.availabilityMode,
    );
  }

  function isItemVisible(itemId: ItemId): boolean {
    if (!isItemScoped(itemId)) return false;
    return isRowVisible(
      itemId,
      userState.state.completed.museum.has(itemId),
      userState.state.showCompleted,
      recentlyCompleted,
    );
  }

  function toggleItem(itemId: ItemId, wingItems: ItemId[], setItems: ItemId[]): void {
    userState.toggleMuseumItem(itemId);
    const completed = userState.state.completed.museum.has(itemId);
    const item = trackerData.items[itemId];
    showUndoToast(item.name, completed, () => {
      userState.toggleMuseumItem(itemId);
    });
    if (completed) {
      if (!userState.state.showCompleted) markLeaving(itemId);
      if (isCategoryComplete()) {
        celebrateCategory();
      } else if (isWingComplete(wingItems)) {
        celebrate();
      } else if (isSetComplete(setItems)) {
        celebrate();
      }
    }
  }
</script>

{#if redactGuard.condition}
  <ConfirmRedactedDialog
    condition={redactGuard.condition}
    bind:open={redactGuard.open}
    onCancel={() => {
      redactGuard.cancel();
    }}
    onComplete={() => {
      redactGuard.complete();
    }}
    onCompleteAndUpdate={() => {
      redactGuard.completeAndUpdate();
    }}
  />
{/if}

{#each trackerData.museum as wing (wing.id)}
  {@const wingItems = wing.sets.flatMap((s) => s.items)}
  {@const scopedWingItems = wingItems.filter(isItemScoped)}
  {@const visibleWingItems = wingItems.filter(isItemVisible)}
  {#if visibleWingItems.length > 0}
    <ExpandableSection
      count={scopedWingItems.filter((id) => userState.state.completed.museum.has(id)).length}
      forceOpen={!!nameFilter}
      name={wing.name}
      total={scopedWingItems.length}
    >
      {#each wing.sets as set (set.id)}
        {@const scopedSetItems = set.items.filter(isItemScoped)}
        {@const visibleSetItems = set.items.filter(isItemVisible)}
        {#if visibleSetItems.length > 0}
          <ExpandableSection
            count={scopedSetItems.filter((id) => userState.state.completed.museum.has(id)).length}
            forceOpen={!!nameFilter}
            name={set.name}
            total={scopedSetItems.length}
          >
            {#each visibleSetItems as itemId (itemId)}
              {@const museumCompleted = userState.state.completed.museum.has(itemId)}
              {@const museumItemSources = trackerData.items[itemId].sources ?? []}
              {@const museumItemVisibility = trackerData.items[itemId].visibility ?? {
                type: "always",
              }}
              <TrackerRow
                display={rowDisplay(itemId, museumItemSources)}
                lookups={{ ...baseLookups, recipeVisibility: museumItemVisibility }}
                name={trackerData.items[itemId].name}
                sources={museumItemSources}
                onToggle={() => {
                  if (itemNameVisible(itemId) || museumCompleted) {
                    toggleItem(itemId, wingItems, set.items);
                  } else {
                    redactGuard.guard(museumItemVisibility, () => {
                      toggleItem(itemId, wingItems, set.items);
                    });
                  }
                }}
              />
            {/each}
          </ExpandableSection>
        {/if}
      {/each}
    </ExpandableSection>
  {/if}
{/each}

{#if trackerData.museum.every((wing) => wing.sets
    .flatMap((s) => s.items)
    .every((id) => userState.state.completed.museum.has(id))) && !userState.state.showCompleted}
  <p class="py-8 text-center text-base text-muted-foreground">
    All done! Toggle "Show completed" to review.
  </p>
{/if}
