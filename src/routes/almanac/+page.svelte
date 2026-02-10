<script lang="ts">
  import { BookCheck } from "@lucide/svelte";

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

  let nameFilter = $state("");

  function matchesFilter(itemId: ItemId, name: string): boolean {
    if (!nameFilter) return true;
    return name.toLowerCase().includes(nameFilter.toLowerCase());
  }

  function shouldShowItem(itemId: ItemId): boolean {
    const itemName = trackerData.items[itemId]?.name ?? "";
    if (!matchesFilter(itemId, itemName)) return false;
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
      // Flatten "Other" subcategories to top level
      const group = parsed.group === "Other" ? parsed.name : parsed.group;
      const name = parsed.group === "Other" ? parsed.name : parsed.name;
      (groups[group] ??= []).push({
        items: Object.entries(items).sort(([, a], [, b]) => a.name.localeCompare(b.name)),
        key,
        name,
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
  <CategoryHeader
    icon={BookCheck}
    name="Almanac"
    onSearch={(q) => (nameFilter = q)}
    {progress}
    showWorldState
  />

  {#each groupedCategories() as { categories, group } (group)}
    {@const groupItems = categories.flatMap((c) => c.items.map(([id]) => id as ItemId))}
    {@const groupCompleted = groupItems.filter((id) =>
      userState.state.completed.almanac.has(id),
    ).length}
    {@const visibleGroupItems = groupItems.filter(shouldShowItem)}
    {#if visibleGroupItems.length > 0}
      <ExpandableSection
        count={groupCompleted}
        forceOpen={!!nameFilter}
        name={group}
        total={groupItems.length}
      >
        {#if categories.length === 1 && categories[0].name === group}
          <!-- Single category in group (flattened "Other") — render items directly -->
          {@const isFishCategory =
            categories[0].key.startsWith("fish/") || categories[0].key.startsWith("mines/")}
          {#each categories[0].items as [itemId, item] (itemId)}
            {#if shouldShowItem(itemId as ItemId)}
              <ItemRow
                completed={userState.state.completed.almanac.has(itemId as ItemId)}
                dimmed={isItemDimmed(itemId as ItemId)}
                hideFishSize={!isFishCategory}
                itemId={itemId as ItemId}
                name={item.name}
                onToggle={() => {
                  userState.toggleAlmanacItem(itemId as ItemId);
                }}
              />
            {/if}
          {/each}
        {:else}
          {#each categories as cat (cat.key)}
            {@const catItemIds = cat.items.map(([id]) => id as ItemId)}
            {@const catCompleted = catItemIds.filter((id) =>
              userState.state.completed.almanac.has(id),
            ).length}
            {@const visibleCatItems = catItemIds.filter(shouldShowItem)}
            {@const isFishCategory = cat.key.startsWith("fish/") || cat.key.startsWith("mines/")}
            {#if visibleCatItems.length > 0}
              <ExpandableSection
                count={catCompleted}
                forceOpen={!!nameFilter}
                name={cat.name}
                total={catItemIds.length}
              >
                {#each cat.items as [itemId, item] (itemId)}
                  {#if shouldShowItem(itemId as ItemId)}
                    <ItemRow
                      completed={userState.state.completed.almanac.has(itemId as ItemId)}
                      dimmed={isItemDimmed(itemId as ItemId)}
                      hideFishSize={!isFishCategory}
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
        {/if}
      </ExpandableSection>
    {/if}
  {/each}
</div>
