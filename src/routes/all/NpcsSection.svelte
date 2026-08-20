<script lang="ts">
  import { Lock } from "@lucide/svelte";

  import { Icon } from "$lib/components/icon/index.js";
  import Stepper from "$lib/components/stepper.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { type CategoryProgress, MAX_NPC_LEVEL } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordKeys } from "$lib/utils";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import SectionHeader from "./SectionHeader.svelte";

  import type { NpcId } from "$lib/types/tracker-data.js";

  function isNpcKnown(id: NpcId): boolean {
    return userState.progressionState.knownNpcs.has(id);
  }

  // Matches the rainbow color scale on the full NPC page
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

  function areAllNpcsMaxed(): boolean {
    return recordKeys(trackerData.npcs).every(
      (id) => (userState.state.completed.npcLevels[id] ?? 0) >= MAX_NPC_LEVEL,
    );
  }

  function setNpcLevelWithCelebration(id: NpcId, newLevel: number): void {
    const wasCategoryComplete = areAllNpcsMaxed();
    userState.setNpcLevel(id, newLevel);
    if (!wasCategoryComplete && areAllNpcsMaxed()) {
      celebrateCategory();
    }
  }

  const { progress }: { progress: CategoryProgress } = $props();

  let npcs = $derived(
    Object.entries(trackerData.npcs)
      .map(([id, npc]) => ({ ...npc, id: id as NpcId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <div class="flex flex-col gap-1">
    <SectionHeader key="npcs" {progress} />
    <div class="flex flex-col gap-1">
      {#each npcs as npc (npc.id)}
        {@const level = userState.state.completed.npcLevels[npc.id] ?? 0}
        {@const maxed = level >= MAX_NPC_LEVEL}
        {@const known = isNpcKnown(npc.id)}
        {#if !known}
          <div class="flex items-center gap-2 rounded-md px-2 py-1.5">
            <Lock class="size-4 shrink-0 text-muted-foreground/50" />
            <span class="min-w-0 flex-1 text-base text-muted-foreground italic">Redacted</span>
          </div>
        {:else if maxed ? userState.state.showCompleted : true}
          <div class="flex items-center gap-2 rounded-md px-2 {maxed ? 'opacity-40' : ''}">
            <div class="flex min-w-0 flex-1 items-center gap-1.5">
              <span class="truncate text-base font-medium">{npc.name}</span>
              <span class="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                <Icon.Season season={npc.birthday.season} class="size-2.5" />
                {npc.birthday.day}
              </span>
            </div>
            <div class="w-32 shrink-0">
              <Stepper
                size="sm"
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
              >
                <Icon.ProgressMark
                  type={npc.dateable ? "relationship_dateable" : "relationship_platonic"}
                  class="size-4 transition-colors duration-200 {level > 0
                    ? `${LEVEL_COLORS[level - 1]} fill-current`
                    : 'fill-transparent text-muted-foreground/30'}"
                />
              </Stepper>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </div>
{/if}
