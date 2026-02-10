<script lang="ts">
  import { CheckCheck, Landmark, Undo2 } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import ItemRow from "$lib/components/item-row.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
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

  let nameFilter = $state("");

  function matchesFilter(itemId: ItemId): boolean {
    if (!nameFilter) return true;
    const name = trackerData.items[itemId]?.name ?? "";
    return name.toLowerCase().includes(nameFilter.toLowerCase());
  }

  function shouldShowItem(itemId: ItemId): boolean {
    if (!matchesFilter(itemId)) return false;
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

<div class="flex flex-col gap-4 p-4">
  <CategoryHeader
    icon={Landmark}
    name="Museum"
    onSearch={(q) => (nameFilter = q)}
    {progress}
    showWorldState
  />

  {#each Object.entries(trackerData.museum) as [wingId, wing] (wingId)}
    {@const wingItems = Object.values(wing.sets).flatMap((s) => s.items)}
    {@const visibleWingItems = wingItems.filter(shouldShowItem)}
    {#if visibleWingItems.length > 0}
      <ExpandableSection
        count={wingItems.filter((id) => userState.state.completed.museum.has(id)).length}
        forceOpen={!!nameFilter}
        name={wing.name}
        total={wingItems.length}
      >
        {#each Object.entries(wing.sets) as [setId, set] (setId)}
          {@const visibleSetItems = set.items.filter(shouldShowItem)}
          {@const setComplete = isSetComplete(set.items)}
          {#if visibleSetItems.length > 0}
            <ExpandableSection
              count={set.items.filter((id) => userState.state.completed.museum.has(id)).length}
              forceOpen={!!nameFilter}
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
              <div class="mt-1 flex justify-end px-2">
                {#if setComplete}
                  <Button
                    class="h-6 text-xs"
                    variant="ghost"
                    size="sm"
                    onclick={() => { userState.uncompleteMuseumSet(set.items); }}
                  >
                    <Undo2 class="size-3" />
                    Undo set
                  </Button>
                {:else}
                  <Button
                    class="h-6 text-xs"
                    variant="ghost"
                    size="sm"
                    onclick={() => { userState.completeMuseumSet(set.items); }}
                  >
                    <CheckCheck class="size-3" />
                    Complete set
                  </Button>
                {/if}
              </div>
            </ExpandableSection>
          {/if}
        {/each}
      </ExpandableSection>
    {/if}
  {/each}
</div>
