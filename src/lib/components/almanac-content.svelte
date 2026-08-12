<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import ItemRow from "$lib/components/item-row.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { isItemDimmed, isRowVisible, shouldCountItem } from "$lib/engine/availability.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { ItemId } from "$lib/types/tracker-data.js";

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

  function isFishCategory(catId: string): boolean {
    return catId === "fish";
  }
</script>

{#each trackerData.almanac as cat (cat.id)}
  {@const catItemIds = Object.keys(cat.items) as ItemId[]}
  {@const catEntries = Object.entries(cat.items).sort(([, a], [, b]) =>
    a.name.localeCompare(b.name),
  )}
  {@const scopedItems = catEntries.filter(([id, item]) => {
    if (!matchesFilter(item.name)) return false;
    return shouldCountItem(
      id as ItemId,
      userState.state.completed.almanac.has(id as ItemId),
      trackerData.sources,
      userState.state.worldState,
      userState.state.availabilityMode,
    );
  })}
  {@const filteredItems = scopedItems.filter(([id]) =>
    isRowVisible(
      id as ItemId,
      userState.state.completed.almanac.has(id as ItemId),
      userState.state.showCompleted,
      recentlyCompleted,
    ),
  )}
  {#if filteredItems.length > 0}
    <ExpandableSection
      count={scopedItems.filter(([id]) => userState.state.completed.almanac.has(id as ItemId))
        .length}
      forceOpen={!!nameFilter}
      name={cat.name}
      total={scopedItems.length}
    >
      {@const showAll = expandedSections[cat.id] ?? false}
      {@const displayItems = showAll ? filteredItems : filteredItems.slice(0, SECTION_LIMIT)}
      {#each displayItems as [itemId, item] (itemId)}
        <ItemRow
          completed={userState.state.completed.almanac.has(itemId as ItemId)}
          dimmed={isItemDimmed(
            itemId as ItemId,
            userState.state.completed.almanac.has(itemId as ItemId),
            trackerData.sources,
            userState.state.worldState,
            userState.state.availabilityMode,
          )}
          hideFishSize={!isFishCategory(cat.id)}
          itemId={itemId as ItemId}
          leaving={recentlyCompleted.has(itemId as ItemId)}
          name={item.name}
          onToggle={() => {
            userState.toggleAlmanacItem(itemId as ItemId);
            const completed = userState.state.completed.almanac.has(itemId as ItemId);
            showUndoToast(item.name, completed, () => {
              userState.toggleAlmanacItem(itemId as ItemId);
            });
            if (completed) {
              if (!userState.state.showCompleted) markLeaving(itemId as ItemId);
              checkCelebration(catItemIds);
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
