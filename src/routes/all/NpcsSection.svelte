<script lang="ts">
  import { Flower, Leaf, Snowflake, Sun } from "@lucide/svelte";

  import Stepper from "$lib/components/stepper.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { getNpcsProgress, MAX_NPC_LEVEL } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import SectionHeader from "./SectionHeader.svelte";

  import type { Component } from "svelte";

  import type { NpcId, Season } from "$lib/types/tracker-data.js";

  const SEASON_ICON: Record<Season, Component<{ class?: string; strokeWidth?: number }>> = {
    fall: Leaf,
    spring: Flower,
    summer: Sun,
    winter: Snowflake,
  };

  function areAllNpcsMaxed(): boolean {
    return Object.keys(trackerData.npcs).every(
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

  let progress = $derived(
    getNpcsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let npcs = $derived(
    Object.entries(trackerData.npcs)
      .map(([id, npc]) => ({ ...npc, id: id as NpcId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <div class="flex flex-col gap-1">
    <SectionHeader category={CATEGORY_BY_KEY.npcs} {progress} />
    <div class="flex flex-col gap-2">
      {#each npcs as npc (npc.id)}
        {@const level = userState.state.completed.npcLevels[npc.id as string] ?? 0}
        {@const maxed = level >= MAX_NPC_LEVEL}
        {#if maxed ? userState.state.showCompleted : true}
          {@const BdayIcon = SEASON_ICON[npc.birthday.season]}
          <div class="flex flex-col gap-1 rounded-md px-2 py-1.5 {maxed ? 'opacity-40' : ''}">
            <div class="flex items-center gap-2">
              <span class="min-w-0 flex-1 text-base font-medium">{npc.name}</span>
              <span class="flex items-center gap-0.5 text-sm text-muted-foreground">
                <BdayIcon
                  class="size-3 {npc.birthday.season === 'fall' ? '-scale-y-100 rotate-90' : ''}"
                  strokeWidth={npc.birthday.season === "summer" ? 2.5 : undefined}
                />
                {npc.birthday.day}
              </span>
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
            >
              <span class="text-sm text-muted-foreground tabular-nums">{level}/{MAX_NPC_LEVEL}</span
              >
            </Stepper>
          </div>
        {/if}
      {/each}
    </div>
  </div>
{/if}
