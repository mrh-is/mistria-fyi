<script lang="ts">
  import { Star } from "@lucide/svelte";

  import Stepper from "$lib/components/stepper.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { getRenownProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import SectionHeader from "./SectionHeader.svelte";

  // Colors per rank (Wood → Mistril), matched to the in-game chart
  const RANK_COLORS = [
    "#92400e", // Wood      — amber-800
    "#a8a29e", // Stone     — stone-400
    "#f97316", // Copper    — orange-500
    "#ef4444", // Ruby      — red-500
    "#94a3b8", // Iron      — slate-400
    "#3b82f6", // Sapphire  — blue-500
    "#cbd5e1", // Silver    — slate-300
    "#10b981", // Emerald   — emerald-500
    "#fbbf24", // Gold      — amber-400
    "#67e8f9", // Diamond   — cyan-300
    "#a78bfa", // Mistril   — violet-400
  ];

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
  let currentRankColor = $derived(RANK_COLORS[currentRankIndex]);
  let levelInRank = $derived(level - currentRankIndex * levelsPerRank);
  let fillPct = $derived(isMaxed ? 100 : (levelInRank / levelsPerRank) * 100);

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
      <span class="min-w-0 flex-1 text-base font-medium">{currentRankName}</span>
      <!-- Partially-filled rank star -->
      <div class="relative size-4 shrink-0" aria-hidden="true">
        <Star
          class="absolute inset-0 size-4"
          style="color: {currentRankColor}"
          strokeWidth={1.5}
        />
        {#if fillPct > 0}
          <div
            class="absolute inset-0 overflow-hidden"
            style="clip-path: inset(0 {100 - fillPct}% 0 0)"
          >
            <Star
              class="size-4"
              style="color: {currentRankColor}"
              fill={currentRankColor}
              strokeWidth={1.5}
            />
          </div>
        {/if}
      </div>
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
