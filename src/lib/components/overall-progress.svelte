<script lang="ts">
  import { getOverallProgress } from "$lib/engine/progress.js";
  import * as m from "$lib/paraglide/messages.js";

  import type { AllProgress } from "$lib/engine/progress.js";

  let { progress }: { progress: AllProgress } = $props();

  let overall = $derived.by(() => {
    const { completed, total } = getOverallProgress(progress);
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, pct, total };
  });
</script>

<div
  class="flex shrink-0 flex-col items-end leading-none"
  aria-label={m.overall_progress_label({
    completed: overall.completed,
    pct: overall.pct,
    total: overall.total,
  })}
  aria-live="polite"
  role="img"
>
  <span class="font-data text-sm text-foreground" aria-hidden="true">{overall.pct}%</span>
  <span class="font-data text-[10px] text-muted-foreground" aria-hidden="true">
    {overall.completed} / {overall.total}
  </span>
</div>
