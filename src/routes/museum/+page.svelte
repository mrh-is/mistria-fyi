<script lang="ts">
  import { Landmark } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import ItemRow from "$lib/components/item-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isItemAvailable } from "$lib/engine/availability.js";
  import { getMuseumProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { ItemId } from "$lib/types/tracker-data.js";

  let progress = $derived(
    getMuseumProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  function shouldShowItem(itemId: ItemId): boolean {
    const completed = userState.state.completed.museum.has(itemId);

    // If the item is completed and we're hiding completed items, don't show it
    if (completed && !userState.state.showCompleted) return false;

    // If completed items are shown and this one is completed, always show it
    if (completed) return true;

    // For incomplete items, check availability against current world state and mode
    return isItemAvailable(
      itemId,
      trackerData.sources,
      userState.state.worldState,
      userState.state.availabilityMode,
    );
  }

  function isItemDimmed(itemId: ItemId): boolean {
    if (userState.state.completed.museum.has(itemId)) return false;
    // In "everything" mode, dim items that aren't currently available
    if (userState.state.availabilityMode !== "everything") return false;
    return !isItemAvailable(itemId, trackerData.sources, userState.state.worldState, "available");
  }
</script>

<div class="flex flex-col gap-4 p-4">
  <CategoryHeader icon={Landmark} name="Museum" {progress} />

  {#each Object.entries(trackerData.museum) as [wingId, wing] (wingId)}
    {@const wingItems = Object.values(wing.sets).flatMap((s) => s.items)}
    {@const visibleWingItems = wingItems.filter(shouldShowItem)}
    {#if visibleWingItems.length > 0}
      <ExpandableSection
        count={wingItems.filter((id) => userState.state.completed.museum.has(id)).length}
        name={wing.name}
        total={wingItems.length}
      >
        {#each Object.entries(wing.sets) as [setId, set] (setId)}
          {@const visibleSetItems = set.items.filter(shouldShowItem)}
          {#if visibleSetItems.length > 0}
            <ExpandableSection
              count={set.items.filter((id) => userState.state.completed.museum.has(id)).length}
              name={set.name}
              total={set.items.length}
            >
              {#each set.items as itemId (itemId)}
                {#if shouldShowItem(itemId)}
                  <ItemRow
                    completed={userState.state.completed.museum.has(itemId)}
                    dimmed={isItemDimmed(itemId)}
                    {itemId}
                    name={trackerData.items[itemId].name}
                    onToggle={() => {
                      userState.toggleMuseumItem(itemId);
                    }}
                  />
                {/if}
              {/each}
            </ExpandableSection>
          {/if}
        {/each}
      </ExpandableSection>
    {/if}
  {/each}
</div>
