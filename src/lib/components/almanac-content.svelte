<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import ConfirmRedactedDialog from "$lib/components/confirm-redacted-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
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
  import type { AcquisitionSource, Item, ItemId } from "$lib/types/tracker-data.js";
  import type { VisibilityCondition } from "$lib/types/visibility.js";

  const redactGuard = createRedactionGuard();

  function itemNameVisible(item: { visibility?: VisibilityCondition }): boolean {
    return isEntityNameVisible(item.visibility ?? { type: "always" }, userState.progressionState);
  }

  function rowDisplay(
    itemId: ItemId,
    item: { visibility?: VisibilityCondition },
    sources: AcquisitionSource[],
  ): TrackerRowDisplay {
    const completed = userState.state.completed.almanac.has(itemId);
    if (!itemNameVisible(item)) return { mode: "redacted" };
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
      Object.entries(trackerData.stores)
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
    return trackerData.almanac.every((cat) =>
      Object.keys(cat.items).every((id) => userState.state.completed.almanac.has(id as ItemId)),
    );
  }

  function checkCelebration(sectionItemIds: ItemId[]): void {
    if (isAlmanacComplete()) {
      celebrateCategory();
    } else if (sectionItemIds.every((id) => userState.state.completed.almanac.has(id))) {
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
    const completed = userState.state.completed.almanac.has(itemId);
    showUndoToast(item.name, completed, () => {
      userState.toggleAlmanacItem(itemId);
    });
    if (completed) {
      if (!userState.state.showCompleted) markLeaving(itemId);
      checkCelebration(catItemIds);
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

{#each trackerData.almanac as cat (cat.id)}
  {@const catItemIds = Object.keys(cat.items) as ItemId[]}
  {@const catEntries = catItemIds
    .map((id) => [id, trackerData.items[id]] as [ItemId, Item])
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))}
  {@const scopedItems = catEntries.filter(([id, item]) => {
    if (!matchesFilter(item.name)) return false;
    return shouldCountItem(
      item.sources ?? [],
      userState.state.completed.almanac.has(id),
      userState.state.worldState,
      userState.state.availabilityMode,
    );
  })}
  {@const filteredItems = scopedItems.filter(([id]) =>
    isRowVisible(
      id,
      userState.state.completed.almanac.has(id),
      userState.state.showCompleted,
      recentlyCompleted,
    ),
  )}
  {#if filteredItems.length > 0}
    <ExpandableSection
      count={scopedItems.filter(([id]) => userState.state.completed.almanac.has(id)).length}
      forceOpen={!!nameFilter}
      name={cat.name}
      total={scopedItems.length}
    >
      {@const showAll = expandedSections[cat.id] ?? false}
      {@const displayItems = showAll ? filteredItems : filteredItems.slice(0, SECTION_LIMIT)}
      {#each displayItems as [itemId, item] (itemId)}
        {@const itemCompleted = userState.state.completed.almanac.has(itemId)}
        {@const itemSources = trackerData.items[itemId].sources ?? []}
        {@const itemVisibility = item.visibility ?? { type: "always" }}
        <TrackerRow
          display={rowDisplay(itemId, item, itemSources)}
          lookups={{ ...baseLookups, entityVisibility: itemVisibility }}
          name={item.name}
          sources={itemSources}
          onToggle={() => {
            if (itemNameVisible(item) || itemCompleted) {
              toggleItem(itemId, item, catItemIds);
            } else {
              redactGuard.guard(itemVisibility, () => {
                toggleItem(itemId, item, catItemIds);
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
              expandedSections[cat.id] = true;
            }}
          >
            Show {filteredItems.length - SECTION_LIMIT} more...
          </Button>
        </div>
      {/if}
    </ExpandableSection>
  {/if}
{/each}

{#if trackerData.almanac.every( (cat) => Object.keys(cat.items).every( (id) => userState.state.completed.almanac.has(id as ItemId) ) ) && !userState.state.showCompleted}
  <p class="py-8 text-center text-base text-muted-foreground">
    All done! Toggle "Show completed" to review.
  </p>
{/if}
