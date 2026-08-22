<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import ConfirmSpoilerDialog from "$lib/components/confirm-spoiler-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
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
  import type { Item, ItemId } from "$lib/types/tracker-data.js";
  import type { VisibilityCondition } from "$lib/types/visibility.js";

  const spoilerGuard = createSpoilerGuard();

  function isItemCompleted(itemId: ItemId): boolean {
    return userState.state.completed.almanac.has(itemId);
  }

  function itemNameVisible(item: { visibility?: VisibilityCondition }): boolean {
    return isEntityNameVisible(item.visibility, userState.progressionState);
  }

  function rowDisplay(
    itemId: ItemId,
    item: { visibility?: VisibilityCondition },
    sources: Source[],
  ): TrackerRowDisplay {
    const completed = isItemCompleted(itemId);
    if (!itemNameVisible(item)) return { mode: "spoilered" };
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

  let recentlyCompleted = new SvelteSet<ItemId>();

  function markLeaving(itemId: ItemId): void {
    recentlyCompleted.add(itemId);
    setTimeout(() => recentlyCompleted.delete(itemId), 1050);
  }

  function isAlmanacComplete(): boolean {
    return recordValues(trackerData.almanac).every((cat) =>
      cat.items.every((id) => isItemCompleted(id)),
    );
  }

  function checkCelebration(sectionItemIds: ItemId[]): void {
    if (isAlmanacComplete()) {
      celebrateCategory();
    } else if (sectionItemIds.every((id) => isItemCompleted(id))) {
      celebrate();
    }
  }

  const SECTION_LIMIT = 50;

  let expandedSections = $state<Record<string, boolean>>({});

  let nameFilter = $derived(toolbarState.searchQuery);

  function matchesFilter(name: string): boolean {
    if (!nameFilter) return true;
    return name.toLowerCase().includes(nameFilter.toLowerCase());
  }

  function toggleItem(
    itemId: ItemId,
    item: { name: string; visibility?: VisibilityCondition },
    catItemIds: ItemId[],
  ): void {
    userState.toggleAlmanacItem(itemId);
    const completed = isItemCompleted(itemId);
    showUndoToast(item.name, completed, () => {
      userState.toggleAlmanacItem(itemId);
    });
    if (completed) {
      if (!userState.state.showCompleted) markLeaving(itemId);
      checkCelebration(catItemIds);
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

{#each recordEntries(trackerData.almanac) as [id, cat] (id)}
  {@const catEntries = cat.items
    .map((id) => [id, trackerData.items[id]] as [ItemId, Item])
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))}
  {@const scopedItems = catEntries.filter(([id, item]) => {
    if (!matchesFilter(item.name)) return false;
    return shouldCountItem(
      item.sources,
      isItemCompleted(id),
      userState.state.worldState,
      userState.state.availabilityMode,
    );
  })}
  {@const filteredItems = scopedItems.filter(([id]) =>
    isRowVisible(id, isItemCompleted(id), userState.state.showCompleted, recentlyCompleted),
  )}
  {#if filteredItems.length > 0}
    <ExpandableSection
      count={scopedItems.filter(([id]) => isItemCompleted(id)).length}
      forceOpen={!!nameFilter}
      name={cat.name}
      total={scopedItems.length}
    >
      {@const showAll = expandedSections[id] ?? false}
      {@const displayItems = showAll ? filteredItems : filteredItems.slice(0, SECTION_LIMIT)}
      {#each displayItems as [itemId, item] (itemId)}
        {@const itemCompleted = isItemCompleted(itemId)}
        {@const itemSources = trackerData.items[itemId].sources}
        {@const itemVisibility = item.visibility}
        <TrackerRow
          display={rowDisplay(itemId, item, itemSources)}
          lookups={{ ...baseLookups, entityVisibility: itemVisibility }}
          name={item.name}
          sources={itemSources}
          onToggle={() => {
            if (itemNameVisible(item) || itemCompleted) {
              toggleItem(itemId, item, cat.items);
            } else {
              spoilerGuard.guard(itemVisibility, () => {
                toggleItem(itemId, item, cat.items);
              });
            }
          }}
        />
      {/each}
      {#if !showAll && filteredItems.length > SECTION_LIMIT}
        <div class="flex justify-center py-1">
          <Button
            class="h-7 text-sm text-muted-foreground"
            variant="ghost"
            onclick={() => {
              expandedSections[id] = true;
            }}
          >
            Show {filteredItems.length - SECTION_LIMIT} more...
          </Button>
        </div>
      {/if}
    </ExpandableSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isAlmanacComplete()} />
