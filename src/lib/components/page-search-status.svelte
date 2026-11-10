<script lang="ts">
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import { filterNote, shelfLabel } from "#lib/presentation/shelves.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import * as m from "#lib/ui-messages/messages.js";
  import { messageParts } from "#lib/utils/message-parts.js";

  import type { Shelf } from "#lib/engine/shelves.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  let { locale }: { locale: LocaleCode } = $props();

  let query = $derived(toolbarState.searchQuery.trim());
  // Reading the count walks the page's rows, so it waits until there's a note to give.
  let active = $derived(Boolean(query) || toolbarState.isSourceFilterNarrowing);
  let count = $derived(active ? toolbarState.pageSearchCount : undefined);
  let note = $derived(
    count && !toolbarState.searchShowsAll ? filterNote(count.filtered) : undefined,
  );
  let nothingLeft = $derived(count?.visible === 0);

  function showFilteredRows(): void {
    if (query) toolbarState.searchShowsAll = true;
    else toolbarState.resetSourceFilters();
  }

  let announcement = $derived.by(() => {
    if (!count) return "";
    const found =
      query && count.visible > 0
        ? m.search_results_count({ count: count.visible }, { locale })
        : undefined;
    const filtered = note
      ? m.filter_note({ count: note.count, shelf: shelfLabel(note.shelf) }, { locale })
      : undefined;
    let empty: string | undefined;
    if (nothingLeft && !note) {
      empty = query
        ? m.search_no_results({}, { locale })
        : m.filter_note_nothing_left({}, { locale });
    }
    return [found, filtered, empty].filter(Boolean).join(". ");
  });
</script>

{#snippet shelfName(shelf: Shelf)}<span class="page-search-status__shelf">{shelfLabel(shelf)}</span
  >{/snippet}

<!-- Stays mounted, because a live region announces changes only once it's on the page. -->
<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>

{#if count}
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
    {:else if note}
      {@const shelf = note.shelf}
      <p>
        {#each messageParts( (slot) => m.filter_note({ count: note.count, shelf: slot("shelf") }, { locale }) ) as part, index (index)}
          {#if typeof part === "string"}{part}{:else}{@render shelfName(shelf)}{/if}
        {/each}
        <button type="button" onclick={showFilteredRows}
          >{m.filter_note_show({}, { locale })}</button
        >
      </p>
    {/if}
    {#if nothingLeft && !note}
      <TrackerEmptyState
        message={query
          ? m.search_no_results({}, { locale })
          : m.filter_note_nothing_left({}, { locale })}
      />
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

  /* The shelf's heading typeface, in the note's own color. */
  .page-search-status__shelf {
    font-size: var(--text-2xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .page-search-status button {
    min-height: 44px;
    color: var(--color-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
