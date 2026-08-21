<script lang="ts">
  import { Icon } from "$lib/components/icon/index.js";
  import Stepper from "$lib/components/stepper.svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { isEntityNameVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import RankCard from "./RankCard.svelte";

  function isRankVisible(minLevel: number): boolean {
    return isEntityNameVisible(
      { type: "renownLevel", level: minLevel },
      userState.progressionState,
    );
  }

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
  let level = $derived(userState.state.completed.renown);
  let currentRankIndex = $derived(
    Math.max(
      ranks.findLastIndex(({ levels: { start, end } }) => start <= level && level <= end),
      0,
    ),
  );
  let currentRank = $derived(ranks[currentRankIndex]);
  let isMaxed = $derived(level >= maxLevel);
  let currentRankColor = $derived(RANK_COLORS[currentRankIndex]);
  let levelInRank = $derived(level - currentRank.levels.start + 1);
  let levelsInCurrentRank = $derived(currentRank.levels.end - currentRank.levels.start + 1);

  let overallPct = $derived(maxLevel > 0 ? (level / maxLevel) * 100 : 0);

  let editing = $state(false);
  let editValue = $state("");

  function startEditing() {
    editValue = String(level);
    editing = true;
  }

  function commitEdit() {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed)) {
      setRenownWithCelebration(parsed);
    }
    editing = false;
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") editing = false;
  }

  function setRenownWithCelebration(newLevel: number): void {
    const wasDone = level >= maxLevel;
    userState.setRenown(newLevel);
    if (!wasDone && userState.state.completed.renown >= maxLevel) {
      celebrateCategory();
    }
  }
</script>

<!-- Current rank hero -->
<div class="flex flex-col items-center gap-2 rounded-xl bg-accent/60 px-4 py-5">
  <div
    class="flex size-16 items-center justify-center rounded-full"
    style="background-color: {currentRankColor}22; box-shadow: 0 0 0 2px {currentRankColor}44"
  >
    <Icon.ProgressMark
      type="town_rank"
      class="size-9"
      color={currentRankColor}
      fill={currentRankColor}
      strokeWidth={1.5}
    />
  </div>

  <div class="text-center">
    <div class="text-2xl font-bold tracking-tight">{currentRank.name}</div>
    {#if isMaxed}
      <div class="text-sm text-muted-foreground">Max rank reached!</div>
    {:else}
      <div class="text-sm text-muted-foreground">
        Level {levelInRank}/{levelsInCurrentRank} in rank
      </div>
    {/if}
  </div>

  <div class="w-full max-w-xs">
    <Progress class="h-1.5" value={overallPct} />
  </div>

  <!-- Stepper -->
  <Stepper
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
    {#if editing}
      <Input
        class="h-6 w-20 text-center text-sm"
        type="number"
        max={maxLevel}
        min={0}
        value={editValue}
        onblur={commitEdit}
        oninput={(e: Event) => {
          editValue = (e.target as HTMLInputElement).value;
        }}
        onkeydown={handleEditKeydown}
      />
    {:else}
      <button
        class="text-sm text-muted-foreground tabular-nums hover:underline"
        title="Click to edit level directly"
        type="button"
        onclick={startEditing}
      >
        {level}/{maxLevel}
      </button>
    {/if}
  </Stepper>
</div>

<!-- Rank list -->
<div class="flex flex-col gap-0.5">
  {#each ranks as rank, i (rank.name)}
    <RankCard
      name={isRankVisible(i * levelsInCurrentRank) ? rank.name : "Redacted"}
      starColor={RANK_COLORS[i]}
      minLevel={rank.levels.start}
      maxLevel={rank.levels.end}
      currentLevel={level}
    />
  {/each}
</div>
