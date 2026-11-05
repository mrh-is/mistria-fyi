<script lang="ts">
  import ProgressScopeNote from "#lib/components/progress-scope-note.svelte";
  import { getOverallProgress } from "#lib/engine/categories.js";
  import * as m from "#lib/paraglide/messages.js";
  import { progressScope, withProgressScope } from "#lib/presentation/progress-scope.js";
  import { formatNumber, formatPercent, formatPercentParts } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { AllProgress } from "#lib/engine/categories.js";

  let { progress }: { progress: AllProgress } = $props();

  let overall = $derived.by(() => {
    const sum = getOverallProgress(progress);
    const { completed, total } = sum;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, pct, scope: progressScope(sum), total };
  });
</script>

<div
  class="overall-progress"
  aria-label={withProgressScope(
    m.overall_progress_label({
      completed: formatNumber(overall.completed, page.data.locale),
      pct: formatPercent(overall.pct, page.data.locale),
      total: formatNumber(overall.total, page.data.locale),
    }),
    overall.scope,
    page.data.locale,
  )}
  aria-live="polite"
  role="img"
>
  <span class="overall-count" aria-hidden="true">
    <span>
      {formatNumber(overall.completed, page.data.locale)} / {formatNumber(
        overall.total,
        page.data.locale,
      )}
    </span>
    {#if overall.scope}<ProgressScopeNote locale={page.data.locale} scope={overall.scope} />{/if}
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
