<script lang="ts">
  import { getAllProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  const categoryKeys = [
    "museum",
    "almanac",
    "animals",
    "npcs",
    "cosmetics",
    "skills",
    "renown",
    "quests",
    "mines",
  ] as const;

  let progress = $derived(
    getAllProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let overall = $derived(() => {
    let completed = 0;
    let total = 0;
    for (const key of categoryKeys) {
      const p = progress[key];
      completed += p.completed;
      total += p.total;
    }
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, pct, total };
  });

  const viewBox = 24;
  const strokeWidth = 4;
  const radius = (viewBox - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let visualPct = $derived(overall().pct > 0 ? Math.max(overall().pct, 5) : 0);
  let offset = $derived(circumference - (visualPct / 100) * circumference);
</script>

<div
  class="flex items-center gap-1.5"
  aria-label="{overall().completed} of {overall().total} completed overall"
  role="img"
>
  <svg
    viewBox="0 0 {viewBox} {viewBox}"
    class="size-[1.2em] shrink-0 -rotate-90"
    aria-hidden="true"
  >
    <circle
      cx={viewBox / 2}
      cy={viewBox / 2}
      r={radius}
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      class="text-muted-foreground/20"
    />
    <circle
      cx={viewBox / 2}
      cy={viewBox / 2}
      r={radius}
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={offset}
      class="text-primary transition-[stroke-dashoffset] duration-500 ease-out"
    />
  </svg>
  <span class="text-sm font-medium text-muted-foreground tabular-nums" aria-hidden="true"
    >{overall().pct}%</span
  >
</div>
