<script lang="ts">
  import DatesSection from "$lib/components/dates-section.svelte";
  import { Icon } from "$lib/components/icon/index.js";
  import NpcRelationshipPicker from "$lib/components/npc-relationship-picker.svelte";
  import SpoilerSection from "$lib/components/spoiler-section.svelte";
  import Stepper from "$lib/components/stepper.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isNpcComplete, MAX_NPC_LEVEL } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordKeys } from "$lib/utils";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import type { NpcId } from "$lib/types/tracker-data.js";

  function isNpcKnown(id: NpcId): boolean {
    return userState.progressionState.knownNpcs.has(id);
  }

  function areAllNpcsComplete(): boolean {
    return recordKeys(trackerData.npcs).every((id) => isNpcComplete(id, userState.state.completed));
  }

  function setNpcLevelWithCelebration(id: NpcId, newLevel: number): void {
    const wasCategoryComplete = areAllNpcsComplete();
    userState.setNpcLevel(id, newLevel);
    if (!wasCategoryComplete && areAllNpcsComplete()) {
      celebrateCategory();
    }
  }

  let npcs = $derived(
    Object.entries(trackerData.npcs)
      .map(([id, npc]) => ({ ...npc, id: id as NpcId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  // 12 gem/heart colors matching the in-game UI (2 rows of 6)
  const LEVEL_COLORS = [
    "text-violet-600 dark:text-violet-400",
    "text-indigo-700 dark:text-indigo-400",
    "text-blue-600 dark:text-blue-400",
    "text-sky-400 dark:text-sky-300",
    "text-green-500 dark:text-green-400",
    "text-lime-400 dark:text-lime-300",
    "text-amber-400 dark:text-amber-300",
    "text-yellow-300 dark:text-yellow-200",
    "text-orange-500 dark:text-orange-400",
    "text-orange-600 dark:text-orange-400",
    "text-red-500 dark:text-red-400",
    "text-rose-700 dark:text-rose-400",
  ];

  function getNpcLevel(id: NpcId): number {
    return userState.state.completed.npcLevels[id] ?? 0;
  }

  function isComplete(npc: { id: NpcId }): boolean {
    return isNpcComplete(npc.id, userState.state.completed);
  }
</script>

<div class="flex flex-col gap-2">
  {#each npcs as npc (npc.id)}
    {@const level = getNpcLevel(npc.id)}
    {@const maxed = isComplete(npc)}
    {@const known = isNpcKnown(npc.id)}
    <SpoilerSection name={npc.name} revealed={known}>
      {#if maxed ? userState.state.showCompleted : true}
        <div class="flex flex-col gap-1.5 rounded-md px-2 py-1.5 {maxed ? 'opacity-40' : ''}">
          <!-- Name row -->
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 text-base font-medium">{npc.name}</span>
            <span class="flex items-center gap-0.5 text-sm text-muted-foreground">
              <Icon.Season season={npc.birthday.season} class="size-3" />
              {npc.birthday.day}
            </span>
          </div>

          <div
            class="grid justify-items-center gap-0.5"
            style="grid-template-columns: repeat({Math.min(MAX_NPC_LEVEL, 6)}, minmax(0, 1fr))"
          >
            {#each { length: MAX_NPC_LEVEL } as _, i (i)}
              <button
                class="flex size-11 items-center justify-center"
                type="button"
                onclick={() => {
                  setNpcLevelWithCelebration(npc.id, i < level ? i : i + 1);
                }}
              >
                <Icon.ProgressMark
                  type={npc.dateable ? "relationship_dateable" : "relationship_platonic"}
                  class="size-4 transition-colors duration-200 {i < level
                    ? `${LEVEL_COLORS[i]} fill-current`
                    : 'fill-transparent text-muted-foreground/30'}"
                />
              </button>
            {/each}
          </div>

          <Stepper
            decrementDisabled={level <= 0}
            incrementDisabled={level >= MAX_NPC_LEVEL}
            decrementLabel="Decrease {npc.name} hearts"
            incrementLabel="Increase {npc.name} hearts"
            onDecrement={() => {
              setNpcLevelWithCelebration(npc.id, level - 1);
            }}
            onIncrement={() => {
              setNpcLevelWithCelebration(npc.id, level + 1);
            }}
          />

          {#if npc.dateable}
            <NpcRelationshipPicker npcId={npc.id} />
          {/if}
        </div>
      {/if}
    </SpoilerSection>
  {/each}
</div>

<DatesSection />
