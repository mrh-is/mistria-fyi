<script lang="ts">
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { filterNote, shelfLabel } from "#lib/presentation/shelves.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { messageParts } from "#lib/utils/message-parts.js";

  import type { Shelf } from "#lib/engine/shelves.js";

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
        ? plural(count.visible, [`${count.visible} result`, `${count.visible} results`])
        : undefined;
    const filtered = note
      ? plural(note.count, [
          `${note.count} ${shelfLabel(note.shelf)} item is being filtered out.`,
          `${note.count} ${shelfLabel(note.shelf)} items are being filtered out.`,
        ])
      : undefined;
    let empty: string | undefined;
    if (nothingLeft && !note) {
      empty = query ? "No items found" : "Your filters leave nothing on this page.";
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
        Your filters are off for this search.
        <button
          type="button"
          onclick={() => {
            toolbarState.searchShowsAll = false;
          }}>Turn them back on</button
        >
      </p>
    {:else if note}
      {@const shelf = note.shelf}
      <p>
        {#each messageParts( (slot) => plural( note.count, [`${note.count} ${slot("shelf")} item is being filtered out.`, `${note.count} ${slot("shelf")} items are being filtered out.`] ) ) as part, index (index)}
          {#if typeof part === "string"}{part}{:else}{@render shelfName(shelf)}{/if}
        {/each}
        <button type="button" onclick={showFilteredRows}>Show anyway</button>
      </p>
    {/if}
    {#if nothingLeft && !note}
      <TrackerEmptyState
        message={query ? "No items found" : "Your filters leave nothing on this page."}
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
