<script lang="ts">
  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { getMinesProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { SpellId } from "$lib/types/tracker-data.js";

  let progress = $derived(
    getMinesProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let currentBiome = $derived(() => {
    const floor = userState.state.completed.mines.floor;
    // Find the biome for the current floor (last biome whose startFloor <= floor)
    let biome = trackerData.mines.biomes[0];
    for (const b of trackerData.mines.biomes) {
      if (b.startFloor <= floor) biome = b;
    }
    return biome;
  });

  let spells = $derived(
    Object.entries(trackerData.mines.spells)
      .map(([id, spell]) => ({ id: id as SpellId, name: spell.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
</script>

<!-- Override --primary so checkboxes/progress bars inherit category color -->
<div class="flex flex-col gap-4 px-4 pb-4" style="--primary: var(--cat-mines)">
  <CategoryHeader
    color={CATEGORY_BY_KEY.mines.color}
    icon={CATEGORY_BY_KEY.mines.icon}
    name={CATEGORY_BY_KEY.mines.name}
    {progress}
  />

  <ExpandableSection
    count={userState.state.completed.mines.floor}
    name="Floor Progress"
    forceOpen={true}
    total={trackerData.mines.maxFloors}
  >
    <div class="flex flex-col gap-2 py-2">
      <div class="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          onclick={() => {
            userState.setMineFloor(userState.state.completed.mines.floor - 1);
          }}
        >
          −
        </Button>
        <span class="text-lg font-semibold">
          Floor {userState.state.completed.mines.floor}
        </span>
        <Button
          size="sm"
          variant="outline"
          onclick={() => {
            userState.setMineFloor(userState.state.completed.mines.floor + 1);
          }}
        >
          +
        </Button>
      </div>
      <span class="text-muted-foreground text-xs">
        {currentBiome().name}
        (floors {currentBiome().startFloor}–{trackerData.mines.maxFloors})
      </span>
    </div>
  </ExpandableSection>

  <ExpandableSection
    count={userState.state.completed.mines.spells.size}
    name="Spells"
    forceOpen={true}
    total={spells.length}
  >
    {#each spells as spell (spell.id)}
      {@const completed = userState.state.completed.mines.spells.has(spell.id)}
      {#if completed ? userState.state.showCompleted : true}
        <div
          class="flex items-center gap-2 rounded-md px-2 py-1 {completed
            ? 'line-through opacity-40'
            : ''}"
        >
          <Checkbox
            checked={completed}
            onCheckedChange={() => {
              userState.toggleSpell(spell.id);
            }}
          />
          <span class="text-sm">{spell.name}</span>
        </div>
      {/if}
    {/each}
  </ExpandableSection>
</div>
