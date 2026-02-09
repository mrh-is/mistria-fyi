<script lang="ts">
  import { Crown } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getRenownProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getRenownProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let level = $derived(userState.state.completed.renown);
  let levelsPerRank = trackerData.renown.levelsPerRank;
  let ranks = trackerData.renown.ranks;

  function getRenownDisplay(totalLevel: number): {
    levelInRank: number;
    pctInRank: number;
    rankIndex: number;
    rankName: string;
  } {
    const rankIndex = Math.min(Math.floor(totalLevel / levelsPerRank), ranks.length - 1);
    const levelInRank = totalLevel - rankIndex * levelsPerRank;
    return {
      levelInRank,
      pctInRank: (levelInRank / levelsPerRank) * 100,
      rankIndex,
      rankName: ranks[rankIndex].name,
    };
  }

  let display = $derived(getRenownDisplay(level));
</script>

<div class="flex flex-col gap-4 p-4">
  <CategoryHeader icon={Crown} name="Renown" {progress} />

  <div class="flex flex-col gap-3">
    <div class="text-center">
      <div class="text-2xl font-bold">{display.rankName}</div>
      <div class="text-muted-foreground text-sm">
        Level {display.levelInRank}/{levelsPerRank}
      </div>
    </div>

    <Progress class="h-2" value={display.pctInRank} />

    <div class="flex items-center justify-center gap-3">
      <Button
        size="sm"
        variant="outline"
        onclick={() => {
          userState.setRenown(level - 1);
        }}
      >
        −
      </Button>
      <span class="text-muted-foreground text-sm">
        {level}/{ranks.length * levelsPerRank} total
      </span>
      <Button
        size="sm"
        variant="outline"
        onclick={() => {
          userState.setRenown(level + 1);
        }}
      >
        +
      </Button>
    </div>

    <div class="flex flex-col gap-1 pt-2">
      {#each ranks as rank, i (rank.name)}
        {@const rankComplete = level >= (i + 1) * levelsPerRank}
        {@const rankCurrent = i === display.rankIndex}
        <div
          class="flex items-center gap-2 rounded px-2 py-0.5 text-sm {rankComplete
            ? 'text-muted-foreground line-through'
            : ''} {rankCurrent ? 'bg-accent font-medium' : ''}"
        >
          <span class="w-4 text-center text-xs">
            {#if rankComplete}✓{:else if rankCurrent}→{/if}
          </span>
          <span>{rank.name}</span>
        </div>
      {/each}
    </div>
  </div>
</div>
