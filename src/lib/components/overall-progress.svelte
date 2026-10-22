<script lang="ts">
  import { getOverallProgress } from "#lib/engine/categories.js";
  import * as m from "#lib/paraglide/messages.js";
  import { formatNumber, formatPercent } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { AllProgress } from "#lib/engine/categories.js";

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
    completed: formatNumber(overall.completed, page.data.locale),
    pct: formatPercent(overall.pct, page.data.locale),
    total: formatNumber(overall.total, page.data.locale),
  })}
  aria-live="polite"
  role="img"
>
  <span class="font-data text-sm text-foreground" aria-hidden="true"
    >{formatPercent(overall.pct, page.data.locale)}</span
  >
  <span class="font-data text-3xs text-muted-foreground" aria-hidden="true">
    {formatNumber(overall.completed, page.data.locale)} / {formatNumber(
      overall.total,
      page.data.locale,
    )}
  </span>
</div>
