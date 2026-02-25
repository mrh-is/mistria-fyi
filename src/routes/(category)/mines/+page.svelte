<script lang="ts">
  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import Stepper from "$lib/components/stepper.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { getMinesProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { SpellId } from "$lib/types/tracker-data.js";

  function isMinesComplete(): boolean {
    const allSpells = Object.keys(trackerData.mines.spells).every((id) =>
      userState.state.completed.mines.spells.has(id as SpellId),
    );
    return allSpells && userState.state.completed.mines.floor >= trackerData.mines.maxFloors;
  }

  function allSpellsComplete(): boolean {
    return Object.keys(trackerData.mines.spells).every((id) =>
      userState.state.completed.mines.spells.has(id as SpellId),
    );
  }

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

<CategoryHeader category={CATEGORY_BY_KEY.mines} {progress} />

<ExpandableSection
  count={userState.state.completed.mines.floor}
  name="Floor Progress"
  forceOpen={true}
  total={trackerData.mines.maxFloors}
>
  <div class="flex flex-col gap-2 py-2">
    <Stepper
      decrementDisabled={userState.state.completed.mines.floor <= 0}
      incrementDisabled={userState.state.completed.mines.floor >= trackerData.mines.maxFloors}
      decrementLabel="Go up one floor"
      incrementLabel="Go down one floor"
      onDecrement={() => {
        userState.setMineFloor(userState.state.completed.mines.floor - 1);
      }}
      onIncrement={() => {
        userState.setMineFloor(userState.state.completed.mines.floor + 1);
        if (isMinesComplete()) {
          celebrateCategory();
        } else if (userState.state.completed.mines.floor >= trackerData.mines.maxFloors) {
          celebrate();
        }
      }}
    >
      <span class="inline-flex w-full items-center justify-center gap-1 text-xl font-semibold">
        Floor
        <input
          type="number"
          inputmode="numeric"
          min="0"
          max={trackerData.mines.maxFloors}
          value={userState.state.completed.mines.floor}
          onchange={(e) => {
            const v = Math.max(
              0,
              Math.min(trackerData.mines.maxFloors, Number(e.currentTarget.value)),
            );
            userState.setMineFloor(v);
            if (isMinesComplete()) {
              celebrateCategory();
            } else if (v >= trackerData.mines.maxFloors) {
              celebrate();
            }
          }}
          class="w-14 [appearance:textfield] bg-transparent text-center text-xl font-semibold [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </span>
    </Stepper>
    <span class="text-sm text-muted-foreground">
      {currentBiome().name}
      (floors {currentBiome().startFloor}–{currentBiome().endFloor})
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
            const completed = userState.state.completed.mines.spells.has(spell.id);
            showUndoToast(spell.name, completed, () => {
              userState.toggleSpell(spell.id);
            });
            if (completed) {
              if (isMinesComplete()) {
                celebrateCategory();
              } else if (allSpellsComplete()) {
                celebrate();
              }
            }
          }}
        />
        <span class="text-base">{spell.name}</span>
      </div>
    {/if}
  {/each}
</ExpandableSection>
