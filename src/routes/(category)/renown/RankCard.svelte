<script lang="ts">
  import { Icon } from "$lib/components/icon/index.js";

  interface Props {
    currentLevel: number;
    maxLevel: number;
    minLevel: number;
    name: string;
    starColor: string;
  }

  let { currentLevel, maxLevel, minLevel, name, starColor }: Props = $props();

  let state: "completed" | "current" | "upcoming" = $derived(
    currentLevel < minLevel ? "upcoming" : currentLevel > maxLevel ? "completed" : "current",
  );
  let currentLevelInRank = $derived(currentLevel - minLevel + 1);
  let totalLevelsInRank = $derived(maxLevel - minLevel + 1);
  let fillPct = $derived(Math.min(Math.max(currentLevelInRank, 0) / totalLevelsInRank, 1) * 100);
</script>

<div
  class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors
    {state === 'current' ? 'bg-accent' : ''}
    {state === 'completed' ? 'opacity-50' : ''}
    {state === 'upcoming' ? 'opacity-40' : ''}"
>
  <!-- Star icon -->
  <div class="relative size-7 shrink-0" aria-hidden="true">
    <!-- Background (empty) star -->
    <Icon.ProgressMark
      type="town_rank"
      class="absolute inset-0 size-7 {state === 'upcoming' ? 'text-muted-foreground/30' : ''}"
      style="color: {state !== 'upcoming' ? starColor : ''}"
      strokeWidth={1.5}
    />
    <!-- Filled overlay clipped to fill percentage -->
    {#if fillPct > 0}
      <div
        class="absolute inset-0 overflow-hidden"
        style="clip-path: inset(0 {100 - fillPct}% 0 0)"
      >
        <Icon.ProgressMark
          type="town_rank"
          class="size-7"
          style="color: {starColor}"
          fill={starColor}
          strokeWidth={1.5}
        />
      </div>
    {/if}
  </div>

  <!-- Rank name and level range -->
  <div class="flex min-w-0 flex-1 flex-col">
    <span
      class="text-sm leading-tight font-semibold
        {state === 'current' ? 'text-foreground' : ''}
        {state === 'completed' ? 'text-muted-foreground line-through' : ''}
        {state === 'upcoming' ? 'text-muted-foreground' : ''}"
    >
      {name}
    </span>
    {#if maxLevel === minLevel}
      <span class="text-xs text-muted-foreground">Lv {minLevel}</span>
    {:else}
      <span class="text-xs text-muted-foreground">Lv {minLevel}–{maxLevel}</span>
    {/if}
  </div>

  <!-- Current rank progress indicator -->
  {#if state === "current"}
    <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
      {currentLevelInRank}/{totalLevelsInRank}
    </span>
  {:else if state === "completed"}
    <Icon.ProgressMark
      type="town_rank"
      class="size-4 shrink-0"
      style="color: {starColor}"
      fill={starColor}
      strokeWidth={1.5}
      aria-label="Completed"
    />
  {/if}
</div>
