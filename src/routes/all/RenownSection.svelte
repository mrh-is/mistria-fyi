<script lang="ts">
  import { Icon } from "$lib/components/icon/index.js";
  import Stepper from "$lib/components/stepper.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import SectionHeader from "./SectionHeader.svelte";

  import type { CategoryProgress } from "$lib/engine/progress.js";
  import type { TownRank } from "$lib/types/tracker-data";

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

  const ranks = trackerData.townRanks;
  const maxLevel = ranks[ranks.length - 1].levels.end;

  const { progress }: { progress: CategoryProgress } = $props();

  let level = $derived(userState.state.completed.renown);
  let currentRankIndex = $derived(
    ranks.findLastIndex(({ levels: { start, end } }) => start <= level && level <= end),
  );
  let currentRank = $derived(ranks[currentRankIndex]);
  let isMaxed = $derived(level >= maxLevel);
  let currentRankColor = $derived(RANK_COLORS[currentRankIndex]);
  let fillPct = $derived(calculateFillPercentage(level, currentRank));

  function calculateFillPercentage(level: number, rank: TownRank): number {
    const range = Math.max(rank.levels.end - rank.levels.start, 1);
    const progress = (level - rank.levels.start) / range;
    return Math.min(progress, 1) * 100;
  }

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
    <SectionHeader key="renown" {progress} />
    <div class="flex items-center gap-2 rounded-md px-2 {isMaxed ? 'opacity-40' : ''}">
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <span class="text-base font-medium">{currentRank.name}</span>
        <!-- Partially-filled rank star -->
        <div class="relative size-4 shrink-0" aria-hidden="true">
          <Icon.ProgressMark
            type="town_rank"
            class="absolute inset-0 size-4"
            style="color: {currentRankColor}"
            strokeWidth={1.5}
          />
          {#if fillPct > 0}
            <div
              class="absolute inset-0 overflow-hidden"
              style="clip-path: inset(0 {100 - fillPct}% 0 0)"
            >
              <Icon.ProgressMark
                type="town_rank"
                class="size-4"
                style="color: {currentRankColor}"
                fill={currentRankColor}
                strokeWidth={1.5}
              />
            </div>
          {/if}
        </div>
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
