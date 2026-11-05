<script lang="ts">
  import IconCheck from "@tabler/icons-svelte-runes/icons/check";

  import { progressScopeLabel } from "#lib/presentation/progress-scope.js";

  import type { ProgressScope } from "#lib/presentation/progress-scope.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  /** The quieter line under a fraction. Callers put its text in their own accessible name. */
  let { locale, scope }: { locale: LocaleCode; scope: ProgressScope } = $props();
</script>

<span class="progress-scope-note" data-progress-scope={scope.kind}>
  {#if scope.kind === "done"}<IconCheck class="size-3 shrink-0" />{/if}
  {progressScopeLabel(scope, locale)}
</span>

<style>
  .progress-scope-note {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    color: var(--color-ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    line-height: 1.2;
    white-space: nowrap;
  }
</style>
