<script lang="ts">
  import { BookOpen } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import ItemRow from "$lib/components/item-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isItemAvailable } from "$lib/engine/availability.js";
  import { getAlmanacProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { parseAlmanacCategory } from "$lib/utils/format.js";

  import type { ItemId } from "$lib/types/tracker-data.js";

  let progress = $derived(
    getAlmanacProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  function shouldShowItem(itemId: ItemId): boolean {
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

  // Group categories by their top-level group
  let groupedCategories = $derived(() => {
    const groups: Record<
      string,
      Array<{ items: Array<[string, { name: string }]>; key: string; name: string }>
    > = {};
    for (const [key, items] of Object.entries(trackerData.almanac)) {
      const parsed = parseAlmanacCategory(key);
      (groups[parsed.group] ??= []).push({
        items: Object.entries(items),
        key,
        name: parsed.name,
      });
    }
    // Sort groups and categories within groups
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, cats]) => ({
        categories: cats.sort((a, b) => a.name.localeCompare(b.name)),
        group,
      }));
  });
</script>

<div class="flex flex-col gap-4 p-4">
  <CategoryHeader icon={BookOpen} name="Almanac" {progress} />

  {#each groupedCategories() as { categories, group } (group)}
    {@const groupItems = categories.flatMap((c) => c.items.map(([id]) => id as ItemId))}
    {@const groupCompleted = groupItems.filter((id) =>
      userState.state.completed.almanac.has(id),
    ).length}
    {@const visibleGroupItems = groupItems.filter(shouldShowItem)}
    {#if visibleGroupItems.length > 0}
      <ExpandableSection count={groupCompleted} name={group} total={groupItems.length}>
        {#each categories as cat (cat.key)}
          {@const catItemIds = cat.items.map(([id]) => id as ItemId)}
          {@const catCompleted = catItemIds.filter((id) =>
            userState.state.completed.almanac.has(id),
          ).length}
          {@const visibleCatItems = catItemIds.filter(shouldShowItem)}
          {#if visibleCatItems.length > 0}
            <ExpandableSection count={catCompleted} name={cat.name} total={catItemIds.length}>
              {#each cat.items as [itemId, item] (itemId)}
                {#if shouldShowItem(itemId as ItemId)}
                  <ItemRow
                    completed={userState.state.completed.almanac.has(itemId as ItemId)}
                    dimmed={isItemDimmed(itemId as ItemId)}
                    itemId={itemId as ItemId}
                    name={item.name}
                    onToggle={() => {
                      userState.toggleAlmanacItem(itemId as ItemId);
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
