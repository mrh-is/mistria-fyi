<script lang="ts">
  import { Star } from "@lucide/svelte";

  interface Props {
    levelInRank?: number;
    levelsPerRank?: number;
    maxLevel: number;
    minLevel: number;
    name: string;
    starColor: string;
    state: "completed" | "current" | "upcoming";
  }

  let {
    levelInRank = 0,
    levelsPerRank = 10,
    maxLevel,
    minLevel,
    name,
    starColor,
    state,
  }: Props = $props();

  let fillPct = $derived(
    state === "completed" ? 100 : state === "current" ? (levelInRank / levelsPerRank) * 100 : 0,
  );
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
    <Star
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
        <Star class="size-7" style="color: {starColor}" fill={starColor} strokeWidth={1.5} />
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
    <span class="text-xs text-muted-foreground">Lv {minLevel}–{maxLevel}</span>
  </div>

  <!-- Current rank progress indicator -->
  {#if state === "current"}
    <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
      {levelInRank}/{levelsPerRank}
    </span>
  {:else if state === "completed"}
    <Star
      class="size-4 shrink-0"
      style="color: {starColor}"
      fill={starColor}
      strokeWidth={1.5}
      aria-label="Completed"
    />
  {/if}
</div>
