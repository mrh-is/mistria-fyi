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
</script>

<span class="text-base text-muted-foreground">{overall().pct}%</span>
<span class="text-sm text-muted-foreground">({overall().completed}/{overall().total})</span>
