<script lang="ts">
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { filterNote, shelfLabel } from "#lib/presentation/shelves.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";

  let query = $derived(toolbarState.searchQuery.trim());
  // Reading the count walks the page's rows, so it waits until there's a note to give.
  let active = $derived(Boolean(query) || toolbarState.isSourceFilterNarrowing);
  let count = $derived(active ? toolbarState.pageSearchCount : undefined);
  let note = $derived(
    count && !toolbarState.searchShowsAll ? filterNote(count.filtered) : undefined,
  );
  let nothingLeft = $derived(count?.visible === 0);

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

<!-- Stays mounted, because a live region announces changes only once it's on the page. -->
<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>

<!--
  Filters are the reader's own, set this visit, & the filter button shows they're on. So the page
  only speaks up when nothing is left to show.
-->
{#if nothingLeft}
  <div class="page-search-status" data-page-search-status>
    <TrackerEmptyState
      message={note || !query ? "Your filters leave nothing on this page." : "No items found"}
    />
  </div>
{/if}

<style>
  .page-search-status {
    padding-block: 4px;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-xs);
  }
</style>
