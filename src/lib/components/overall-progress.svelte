<script lang="ts">
  import { getAllProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getAllProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let overall = $derived.by(() => {
    let completed = 0;
    let total = 0;
    for (const p of Object.values(progress)) {
      completed += p.completed;
      total += p.total;
    }
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, pct, total };
  });
</script>

<div
  class="flex shrink-0 flex-col items-end leading-none"
  aria-label="{overall.completed} of {overall.total} completed overall, {overall.pct}%"
  role="img"
>
  <span class="font-data text-sm text-foreground" aria-hidden="true">{overall.pct}%</span>
  <span class="font-data text-[10px] text-muted-foreground" aria-hidden="true">
    {overall.completed} / {overall.total}
  </span>
</div>
