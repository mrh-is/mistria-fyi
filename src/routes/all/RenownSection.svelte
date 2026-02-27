<script lang="ts">
  import Stepper from "$lib/components/stepper.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { getRenownProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import SectionHeader from "./SectionHeader.svelte";

  let levelsPerRank = trackerData.renown.levelsPerRank;
  let ranks = trackerData.renown.ranks;
  let maxLevel = levelsPerRank * ranks.length;

  let progress = $derived(
    getRenownProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let level = $derived(userState.state.completed.renown);
  let currentRankIndex = $derived(Math.min(Math.floor(level / levelsPerRank), ranks.length - 1));
  let currentRankName = $derived(ranks[currentRankIndex].name);
  let isMaxed = $derived(level >= maxLevel);

  function setRenownWithCelebration(newLevel: number): void {
    const wasDone = level >= maxLevel;
    userState.setRenown(newLevel);
    if (!wasDone && userState.state.completed.renown >= maxLevel) {
      celebrateCategory();
    }
  }
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <div class="flex flex-col gap-1">
    <SectionHeader category={CATEGORY_BY_KEY.renown} {progress} />
    <div class="flex items-center gap-2 rounded-md px-2 {isMaxed ? 'opacity-40' : ''}">
      <span class="min-w-0 flex-1 text-sm text-muted-foreground">{currentRankName}</span>
      <div class="w-32 shrink-0">
        <Stepper
          size="sm"
          decrementDisabled={level <= 0}
          incrementDisabled={level >= maxLevel}
          decrementLabel="Decrease renown"
          incrementLabel="Increase renown"
          onDecrement={() => {
            setRenownWithCelebration(level - 1);
          }}
          onIncrement={() => {
            setRenownWithCelebration(level + 1);
          }}
        >
          <span class="text-sm text-muted-foreground tabular-nums">{level}/{maxLevel}</span>
        </Stepper>
      </div>
    </div>
  </div>
{/if}
