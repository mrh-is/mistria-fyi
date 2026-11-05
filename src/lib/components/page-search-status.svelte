<script lang="ts">
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";

  import type { LocaleCode } from "#lib/types/locale.js";

  let { locale }: { locale: LocaleCode } = $props();

  let query = $derived(toolbarState.searchQuery.trim());
  let count = $derived(query ? toolbarState.pageSearchCount : { hidden: 0, visible: 0 });
  let outsideFilters = $derived(
    count.visible > 0
      ? m.search_more_outside_filters({ count: count.hidden }, { locale })
      : m.search_outside_filters({ count: count.hidden }, { locale }),
  );
  let announcement = $derived.by(() => {
    if (!query) return "";
    const found =
      count.visible > 0 ? m.search_results_count({ count: count.visible }, { locale }) : undefined;
    if (count.hidden > 0) return found ? `${found}. ${outsideFilters}` : outsideFilters;
    return found ?? m.search_no_results({}, { locale });
  });
</script>

<!-- Stays mounted, because a live region announces changes only once it's on the page. -->
<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>

{#if query}
  <div class="page-search-status" data-page-search-status>
    {#if toolbarState.searchShowsAll}
      <p>
        {m.search_filters_off({}, { locale })}
        <button
          type="button"
          onclick={() => {
            toolbarState.searchShowsAll = false;
          }}>{m.search_filters_resume({}, { locale })}</button
        >
      </p>
    {:else if count.hidden > 0}
      <p>
        {outsideFilters}
        <button
          type="button"
          onclick={() => {
            toolbarState.searchShowsAll = true;
          }}>{m.search_turn_off_filters({}, { locale })}</button
        >
      </p>
    {:else if count.visible === 0}
      <TrackerEmptyState message={m.search_no_results({}, { locale })} />
    {/if}
  </div>
{/if}

<style>
  .page-search-status {
    display: grid;
    gap: 4px;
    padding-block: 4px;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-xs);
  }

  .page-search-status p {
    margin: 0;
  }

  .page-search-status button {
    min-height: 44px;
    color: var(--color-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
