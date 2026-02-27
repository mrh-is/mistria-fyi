<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import ItemRow from "$lib/components/item-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isItemDimmed, shouldShowItem } from "$lib/engine/availability.js";
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

  function isItemVisible(itemId: ItemId): boolean {
    if (!matchesFilter(itemId)) return false;
    return shouldShowItem(
      itemId,
      userState.state.completed.museum.has(itemId),
      trackerData.sources,
      userState.state.worldState,
      userState.state.availabilityMode,
      userState.state.showCompleted,
      recentlyCompleted,
    );
  }
</script>

{#each trackerData.museum as wing (wing.id)}
  {@const wingItems = wing.sets.flatMap((s) => s.items)}
  {@const visibleWingItems = wingItems.filter(isItemVisible)}
  {#if visibleWingItems.length > 0}
    <ExpandableSection
      count={wingItems.filter((id) => userState.state.completed.museum.has(id)).length}
      forceOpen={!!nameFilter}
      name={wing.name}
      total={wingItems.length}
    >
      {#each wing.sets as set (set.id)}
        {@const visibleSetItems = set.items.filter(isItemVisible)}
        {#if visibleSetItems.length > 0}
          <ExpandableSection
            count={set.items.filter((id) => userState.state.completed.museum.has(id)).length}
            forceOpen={!!nameFilter}
            name={set.name}
            total={set.items.length}
          >
            {#each set.items.filter(isItemVisible) as itemId (itemId)}
              <ItemRow
                completed={userState.state.completed.museum.has(itemId)}
                dimmed={isItemDimmed(
                  itemId,
                  userState.state.completed.museum.has(itemId),
                  trackerData.sources,
                  userState.state.worldState,
                  userState.state.availabilityMode,
                )}
                {itemId}
                leaving={recentlyCompleted.has(itemId)}
                name={trackerData.items[itemId].name}
                onToggle={() => {
                  userState.toggleMuseumItem(itemId);
                  const completed = userState.state.completed.museum.has(itemId);
                  showUndoToast(trackerData.items[itemId].name, completed, () => {
                    userState.toggleMuseumItem(itemId);
                  });
                  if (completed) {
                    if (!userState.state.showCompleted) markLeaving(itemId);
                    if (isCategoryComplete()) {
                      celebrateCategory();
                    } else if (isWingComplete(wingItems)) {
                      celebrate();
                    } else if (isSetComplete(set.items)) {
                      celebrate();
                    }
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
