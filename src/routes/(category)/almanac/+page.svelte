<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import ItemRow from "$lib/components/item-row.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { isItemAvailable } from "$lib/engine/availability.js";
  import { getAlmanacProgress } from "$lib/engine/progress.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { ItemId } from "$lib/types/tracker-data.js";

  // Items held on-screen during their exit animation (800ms linger + 300ms fade)
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

  // Track which sections have been expanded to show all items
  let expandedSections = $state<Record<string, boolean>>({});

  let progress = $derived(
    getAlmanacProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let nameFilter = $derived(toolbarState.searchQuery);

  function matchesFilter(itemId: ItemId, name: string): boolean {
    if (!nameFilter) return true;
    return name.toLowerCase().includes(nameFilter.toLowerCase());
  }

  function shouldShowItem(itemId: ItemId): boolean {
    const item = trackerData.items[itemId];
    if (!item) return false;
    if (!matchesFilter(itemId, item.name)) return false;
    if (recentlyCompleted.has(itemId)) return true;
    const completed = userState.state.completed.almanac.has(itemId);
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
    if (userState.state.completed.almanac.has(itemId)) return false;
    if (userState.state.availabilityMode !== "everything") return false;
    return !isItemAvailable(itemId, trackerData.sources, userState.state.worldState, "available");
  }

  function isFishCategory(catId: string): boolean {
    return catId === "fish";
  }
</script>

<CategoryHeader category={CATEGORY_BY_KEY.almanac} {progress} />

{#each trackerData.almanac as cat (cat.id)}
  {@const catItemIds = Object.keys(cat.items) as ItemId[]}
  {@const catCompleted = catItemIds.filter((id) => userState.state.completed.almanac.has(id)).length}
  {@const catEntries = Object.entries(cat.items).sort(([, a], [, b]) => a.name.localeCompare(b.name))}
  {@const filteredItems = catEntries.filter(([id]) => shouldShowItem(id as ItemId))}
  {#if filteredItems.length > 0}
    <ExpandableSection
      count={catCompleted}
      forceOpen={!!nameFilter}
      name={cat.name}
      total={catItemIds.length}
    >
      {@const showAll = expandedSections[cat.id] ?? false}
      {@const displayItems = showAll ? filteredItems : filteredItems.slice(0, SECTION_LIMIT)}
      {#each displayItems as [itemId, item] (itemId)}
        <ItemRow
          completed={userState.state.completed.almanac.has(itemId as ItemId)}
          dimmed={isItemDimmed(itemId as ItemId)}
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

{#if progress.total > 0 && progress.completed === progress.total && !userState.state.showCompleted}
  <p class="py-8 text-center text-base text-muted-foreground">
    All done! Toggle "Show completed" to review.
  </p>
{/if}
