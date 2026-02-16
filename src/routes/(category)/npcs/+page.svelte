<script lang="ts">
  import { Flower, Heart, Leaf, Minus, Octagon, Plus, Snowflake, Sun } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { getNpcsProgress, MAX_NPC_LEVEL } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { Component } from "svelte";

  import type { NpcId, Season } from "$lib/types/tracker-data.js";

  const SEASON_ICON: Record<Season, Component<{ class?: string; strokeWidth?: number }>> = {
    fall: Leaf,
    spring: Flower,
    summer: Sun,
    winter: Snowflake,
  };

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
    return userState.state.completed.npcLevels[id as string] ?? 0;
  }

  function isMaxed(npc: { id: NpcId }): boolean {
    return getNpcLevel(npc.id) >= MAX_NPC_LEVEL;
  }
</script>

<CategoryHeader category={CATEGORY_BY_KEY.npcs} {progress} />

<div class="flex flex-col gap-2">
  {#each npcs as npc (npc.id)}
    {@const level = getNpcLevel(npc.id)}
    {@const maxed = isMaxed(npc)}
    {#if maxed ? userState.state.showCompleted : true}
      {@const BdayIcon = SEASON_ICON[npc.birthday.season]}
      <div class="flex flex-col gap-1.5 rounded-md px-2 py-1.5 {maxed ? 'opacity-40' : ''}">
        <!-- Name row -->
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

        <div class="flex items-center justify-center gap-0.5">
          <button
            class="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground active:bg-accent disabled:opacity-30"
            type="button"
            disabled={level <= 0}
            onclick={() => {
              userState.setNpcLevel(npc.id, level - 1);
            }}
          >
            <Minus class="size-3.5" />
          </button>

          {#each { length: MAX_NPC_LEVEL } as _, i (i)}
            <button
              class="flex size-7 items-center justify-center"
              type="button"
              onclick={() => {
                userState.setNpcLevel(npc.id, i < level ? i : i + 1);
              }}
            >
              {#if npc.dateable}
                <Heart
                  class="size-4 transition-colors duration-200 {i < level
                    ? `${LEVEL_COLORS[i]} fill-current`
                    : 'fill-transparent text-muted-foreground/30'}"
                />
              {:else}
                <Octagon
                  class="size-4 transition-colors duration-200 {i < level
                    ? `${LEVEL_COLORS[i]} fill-current`
                    : 'fill-transparent text-muted-foreground/30'}"
                />
              {/if}
            </button>
          {/each}

          <button
            class="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground active:bg-accent disabled:opacity-30"
            type="button"
            disabled={level >= MAX_NPC_LEVEL}
            onclick={() => {
              userState.setNpcLevel(npc.id, level + 1);
            }}
          >
            <Plus class="size-3.5" />
          </button>
        </div>
      </div>
    {/if}
  {/each}
</div>
