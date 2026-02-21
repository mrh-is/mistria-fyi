<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import ItemRow from "$lib/components/item-row.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { isItemAvailable } from "$lib/engine/availability.js";
  import { getMuseumProgress } from "$lib/engine/progress.js";
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
      wing.sets
        .flatMap((s) => s.items)
        .every((id) => userState.state.completed.museum.has(id)),
    );
  }

  let progress = $derived(
    getMuseumProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let nameFilter = $derived(toolbarState.searchQuery);

  function matchesFilter(itemId: ItemId): boolean {
    if (!nameFilter) return true;
    const name = trackerData.items[itemId]?.name;
    return name ? name.toLowerCase().includes(nameFilter.toLowerCase()) : false;
  }

  function shouldShowItem(itemId: ItemId): boolean {
    if (!matchesFilter(itemId)) return false;
    if (recentlyCompleted.has(itemId)) return true;
    const completed = userState.state.completed.museum.has(itemId);
    if (completed && !userState.state.showCompleted) return false;
    if (completed) return true;
    return isItemAvailable(
      itemId,
      trackerData.sources,
      userState.state.worldState,
      userState.state.availabilityMode,
    );
  }

  function isItemDimmed(itemId: ItemId): boolean {
    if (userState.state.completed.museum.has(itemId)) return false;
    if (userState.state.availabilityMode !== "everything") return false;
    return !isItemAvailable(itemId, trackerData.sources, userState.state.worldState, "available");
  }

  function isSetComplete(items: ItemId[]): boolean {
    return items.every((id) => userState.state.completed.museum.has(id));
  }
</script>

<CategoryHeader category={CATEGORY_BY_KEY.museum} {progress} />

{#each trackerData.museum as wing (wing.id)}
  {@const wingItems = wing.sets.flatMap((s) => s.items)}
  {@const visibleWingItems = wingItems.filter(shouldShowItem)}
  {#if visibleWingItems.length > 0}
    <ExpandableSection
      count={wingItems.filter((id) => userState.state.completed.museum.has(id)).length}
      forceOpen={!!nameFilter}
      name={wing.name}
      total={wingItems.length}
    >
      {#each wing.sets as set (set.id)}
        {@const visibleSetItems = set.items.filter(shouldShowItem)}
        {#if visibleSetItems.length > 0}
          <ExpandableSection
            count={set.items.filter((id) => userState.state.completed.museum.has(id)).length}
            forceOpen={!!nameFilter}
            name={set.name}
            total={set.items.length}
          >
            {#each set.items.filter(shouldShowItem) as itemId (itemId)}
              <ItemRow
                completed={userState.state.completed.museum.has(itemId)}
                dimmed={isItemDimmed(itemId)}
                {itemId}
                leaving={recentlyCompleted.has(itemId)}
                name={trackerData.items[itemId]?.name ?? itemId}
                onToggle={() => {
                  userState.toggleMuseumItem(itemId);
                  const completed = userState.state.completed.museum.has(itemId);
                  showUndoToast(trackerData.items[itemId]?.name ?? itemId, completed, () => {
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

{#if progress.total > 0 && progress.completed === progress.total && !userState.state.showCompleted}
  <p class="py-8 text-center text-base text-muted-foreground">
    All done! Toggle "Show completed" to review.
  </p>
{/if}
