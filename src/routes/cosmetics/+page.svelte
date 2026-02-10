<script lang="ts">
  import { Shirt } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getCosmeticsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { CosmeticId } from "$lib/types/tracker-data.js";

  let progress = $derived(
    getCosmeticsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  // Group cosmetics by slot
  let groups = $derived(() => {
    const bySlot: Record<string, Array<{ id: CosmeticId; name: string }>> = {};
    for (const [id, cosmetic] of Object.entries(trackerData.cosmetics)) {
      const slot = cosmetic.slot;
      (bySlot[slot] ??= []).push({ id: id as CosmeticId, name: cosmetic.name });
    }
    // Sort items within each slot
    for (const items of Object.values(bySlot)) {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }
    return Object.entries(bySlot).sort(([a], [b]) => a.localeCompare(b));
  });
</script>

<div class="flex flex-col gap-4 p-4">
  <CategoryHeader icon={Shirt} name="Cosmetics" {progress} />

  {#each groups() as [slot, cosmetics] (slot)}
    {@const completedCount = cosmetics.filter((c) =>
      userState.state.completed.cosmetics.has(c.id),
    ).length}
    {@const visibleCosmetics = cosmetics.filter((c) => {
      const done = userState.state.completed.cosmetics.has(c.id);
      return done ? userState.state.showCompleted : true;
    })}
    {#if visibleCosmetics.length > 0}
      <ExpandableSection
        count={completedCount}
        name={slot.charAt(0).toUpperCase() + slot.slice(1)}
        total={cosmetics.length}
      >
        {#each visibleCosmetics as cosmetic (cosmetic.id)}
          {@const completed = userState.state.completed.cosmetics.has(cosmetic.id)}
          <div
            class="flex items-center gap-2 rounded-md px-2 py-1 {completed
              ? 'line-through opacity-40'
              : ''}"
          >
            <Checkbox
              checked={completed}
              onCheckedChange={() => {
                userState.toggleCosmetic(cosmetic.id);
              }}
            />
            <span class="text-sm">{cosmetic.name}</span>
          </div>
        {/each}
      </ExpandableSection>
    {/if}
  {/each}
</div>
