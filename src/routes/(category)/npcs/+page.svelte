<script lang="ts">
  import { Icon } from "$lib/components/icon/index.js";
  import PageHeader from "$lib/components/page-header.svelte";
  import Stepper from "$lib/components/stepper.svelte";
  import { CATEGORY_BY_KEY, categoryColor } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { getNpcsProgress, MAX_NPC_LEVEL } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import type { NpcId } from "$lib/types/tracker-data.js";

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

<PageHeader
  icon={{ color: categoryColor(CATEGORY_BY_KEY.npcs.key), component: CATEGORY_BY_KEY.npcs.icon }}
  title={CATEGORY_BY_KEY.npcs.name}
  {progress}
/>

<div class="flex flex-col gap-2">
  {#each npcs as npc (npc.id)}
    {@const level = getNpcLevel(npc.id)}
    {@const maxed = isMaxed(npc)}
    {#if maxed ? userState.state.showCompleted : true}
      <div class="flex flex-col gap-1.5 rounded-md px-2 py-1.5 {maxed ? 'opacity-40' : ''}">
        <!-- Name row -->
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 text-base font-medium">{npc.name}</span>
          <span class="flex items-center gap-0.5 text-sm text-muted-foreground">
            <Icon.Season
              season={npc.birthday.season}
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
          <div class="flex items-center justify-center gap-0.5">
            {#each { length: MAX_NPC_LEVEL } as _, i (i)}
              <button
                class="flex size-7 items-center justify-center"
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
        </Stepper>
      </div>
    {/if}
  {/each}
</div>
