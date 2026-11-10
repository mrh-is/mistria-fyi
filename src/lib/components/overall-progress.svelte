<script lang="ts">
  import { getOverallProgress } from "#lib/engine/categories.js";
  import * as m from "#lib/ui-messages/messages.js";
  import { formatNumber, formatPercent, formatPercentParts } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { AllProgress } from "#lib/engine/categories.js";

  let { progress }: { progress: AllProgress } = $props();

  let overall = $derived.by(() => {
    const sum = getOverallProgress(progress);
    const { completed, total } = sum;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, pct, total };
  });
</script>

<div
  class="overall-progress"
  aria-label={m.overall_progress_label({
    completed: formatNumber(overall.completed, page.data.locale),
    pct: formatPercent(overall.pct, page.data.locale),
    total: formatNumber(overall.total, page.data.locale),
  })}
  aria-live="polite"
  role="img"
>
  <span class="overall-count" aria-hidden="true">
    {formatNumber(overall.completed, page.data.locale)} / {formatNumber(
      overall.total,
      page.data.locale,
    )}
  </span>
  <span class="overall-percent" aria-hidden="true">
    {#each formatPercentParts(overall.pct, page.data.locale) as part, index (index)}
      {#if part.type === "percentSign"}<span class="overall-percent__sign">{part.value}</span
        >{:else}{part.value}{/if}
    {/each}
  </span>
</div>

<style>
  .overall-progress {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 14px;
  }

  .overall-count {
    display: grid;
    justify-items: end;
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    line-height: 1.25;
  }

  .overall-percent {
    color: var(--color-brand-mark);
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-style: var(--font-display-style);
    line-height: 1;
    white-space: nowrap;
  }

  .overall-percent__sign {
    position: relative;
    top: -0.45em;
    font-size: 0.55em;
  }
</style>
