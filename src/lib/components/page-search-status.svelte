<script lang="ts" module>
  // How many ledgers are showing the note in their own column, so the page-level copy stands down.
  const ledgerHosts = $state({ count: 0 });
</script>

<script lang="ts">
  import { untrack } from "svelte";

  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { filterNote, shelfLabel } from "#lib/presentation/shelves.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";

  /**
   * `page` sits above the page's content & owns the live region. `ledger` sits on the ledger's
   * left edge, beside its index rail, and offers to clear the filters.
   */
  let { placement = "page" }: { placement?: "ledger" | "page" } = $props();

  if (untrack(() => placement) === "ledger") {
    $effect(() => {
      untrack(() => (ledgerHosts.count += 1));
      return () => {
        untrack(() => (ledgerHosts.count -= 1));
      };
    });
  }

  let query = $derived(toolbarState.searchQuery.trim());
  // Reading the count walks the page's rows, so it waits until there's a note to give.
  let active = $derived(Boolean(query) || toolbarState.isSourceFilterNarrowing);
  let count = $derived(active ? toolbarState.pageSearchCount : undefined);
  let note = $derived(
    count && !toolbarState.searchShowsAll ? filterNote(count.filtered) : undefined,
  );
  let nothingLeft = $derived(count?.visible === 0);
  let message = $derived(
    note || !query ? "Your filters leave nothing on this page." : "No items found",
  );

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

{#if placement === "page"}
  <!-- Stays mounted, because a live region announces changes only once it's on the page. -->
  <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
{/if}

<!--
  Filters are the reader's own, set this visit, & the filter button shows they're on. So the page
  only speaks up when nothing is left to show.
-->
{#if nothingLeft && placement === "ledger"}
  <div class="ledger-empty" data-page-search-status>
    <p>{message}</p>
    {#if toolbarState.isSourceFilterNarrowing}
      <button type="button" onclick={() => toolbarState.resetSourceFilters()}>Clear filters</button>
    {/if}
  </div>
{:else if nothingLeft && ledgerHosts.count === 0}
  <div class="page-search-status" data-page-search-status>
    <TrackerEmptyState {message} />
  </div>
{/if}

<style>
  .page-search-status {
    padding-block: 4px;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-xs);
  }

  .ledger-empty {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 1rem;
    padding-block: 0.75rem;
    color: var(--color-ink-muted);
    font-family: var(--font-body);
  }

  .ledger-empty button {
    min-block-size: 44px;
    color: var(--color-guide-voice);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
</style>
