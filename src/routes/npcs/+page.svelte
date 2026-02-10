<script lang="ts">
  import { Heart, Minus, Octagon, Plus } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getNpcsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { seasonEmoji } from "$lib/utils/format.js";

  import type { NpcId } from "$lib/types/tracker-data.js";

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

  function isMaxed(npc: { dateable: boolean; id: NpcId }): boolean {
    const max = npc.dateable ? 12 : 10;
    return getNpcLevel(npc.id) >= max;
  }
</script>

<div class="flex flex-col gap-4 p-4">
  <CategoryHeader icon={Heart} name="NPCs" {progress} />

  <div class="flex flex-col gap-2">
    {#each npcs as npc (npc.id)}
      {@const level = getNpcLevel(npc.id)}
      {@const maxed = isMaxed(npc)}
      {@const max = npc.dateable ? 12 : 10}
      {#if maxed ? userState.state.showCompleted : true}
        <div class="flex flex-col gap-1.5 rounded-md px-2 py-1.5 {maxed ? 'opacity-40' : ''}">
          <!-- Name row -->
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 text-sm font-medium">{npc.name}</span>
            <span class="text-muted-foreground text-[10px]">
              {seasonEmoji(npc.birthday.season)}
              {npc.birthday.day}
            </span>
          </div>

          <!-- Icons + stepper row -->
          <div class="flex items-center gap-1.5">
            <Button
              class="size-6 shrink-0"
              size="icon"
              variant="ghost"
              disabled={level <= 0}
              onclick={() => { userState.setNpcLevel(npc.id, level - 1); }}
            >
              <Minus class="size-3" />
            </Button>

            <div class="flex min-w-0 flex-1 flex-wrap gap-0.5">
              {#each { length: max } as _, i (i)}
                {#if npc.dateable}
                  <Heart
                    class="size-3.5 {i < level ? LEVEL_COLORS[i] : 'text-muted-foreground/30'}"
                    fill={i < level ? "currentColor" : "none"}
                  />
                {:else}
                  <Octagon
                    class="size-3.5 {i < level ? LEVEL_COLORS[i] : 'text-muted-foreground/30'}"
                    fill={i < level ? "currentColor" : "none"}
                  />
                {/if}
              {/each}
            </div>

            <Button
              class="size-6 shrink-0"
              size="icon"
              variant="ghost"
              disabled={level >= max}
              onclick={() => { userState.setNpcLevel(npc.id, level + 1); }}
            >
              <Plus class="size-3" />
            </Button>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
