<script lang="ts" generics="T extends LedgerPlacement & { key: string }">
  import { untrack } from "svelte";

  import { Icon } from "#lib/components/icon/index.js";
  import ShelfHeading from "#lib/components/shelf-heading.svelte";
  import { sourceFilterLabel } from "#lib/data/source-filters.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { ledgerShelf, ledgerSourceFamily } from "#lib/presentation/ledger.js";
  import { shelfLabel } from "#lib/presentation/shelves.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";

  import type { Snippet } from "svelte";

  import type { SourceFilterId } from "#lib/data/source-filters.js";
  import type { Shelf } from "#lib/engine/shelves.js";
  import type { LedgerPlacement } from "#lib/presentation/ledger.js";
  import type { Source } from "#lib/types/acquisition.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  let {
    collapsible = false,
    explains = false,
    forceOpen = false,
    id,
    locale,
    name,
    renderRows = true,
    row,
    rows,
    visible,
  }: {
    collapsible?: boolean;
    explains?: boolean;
    forceOpen?: boolean;
    id?: string;
    locale: LocaleCode;
    name: string;
    renderRows?: boolean;
    row: Snippet<[T, Shelf, readonly Column[], boolean, boolean]>;
    /** Every placement at the last refresh, including the rows filters can bring back. */
    rows: readonly T[];
    visible: (entry: T) => boolean;
  } = $props();

  interface Column {
    id: SourceFilterId;
    type: Source["type"];
  }
  const shelves: readonly Shelf[] = ["todo", "notNow", "completed"];
  const instance = $props.id();
  let open = $state(untrack(() => !collapsible));
  let highlight = $state<SourceFilterId>();
  let families = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch counts for this snapshot.
    const counts = new Map<SourceFilterId, Column & { count: number }>();
    for (const entry of rows) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Count each row once per column.
      const seen = new Set<SourceFilterId>();
      for (const source of entry.visibleSources) {
        const family = ledgerSourceFamily(source);
        if (!family || seen.has(family)) continue;
        seen.add(family);
        const column = counts.get(family) ?? { type: source.type, count: 0, id: family };
        column.count += 1;
        counts.set(family, column);
      }
    }
    return [...counts.values()].toSorted((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  });
  let columns = $derived(families.length > 1 ? families.slice(0, 3) : []);
  let discovery = $derived(rows.some((entry) => entry.hiddenCount > 0));
  let groups = $derived.by(() => {
    const grouped: Record<Shelf, T[]> = { completed: [], notNow: [], todo: [] };
    for (const entry of rows) {
      if (visible(entry) && toolbarState.matchesSourceFilters(entry.sources)) {
        grouped[ledgerShelf(entry, toolbarState.showsSource)].push(entry);
      }
    }
    return grouped;
  });
  let isSearching = $derived(Boolean(toolbarState.searchQuery));
  let hasRows = $derived(shelves.some((shelf) => groups[shelf].length > 0));
  let expanded = $derived(open || forceOpen || isSearching);
</script>

<section {id} data-ledger-section hidden={!hasRows} aria-labelledby={`${instance}-heading`}>
  <h3 id={`${instance}-heading`} tabindex="-1">
    {#if collapsible}
      <button
        type="button"
        data-section-trigger
        aria-expanded={expanded}
        aria-controls={`${instance}-rows`}
        onclick={() => (open = !open)}
      >
        <Icon.UI
          type="disclosure"
          class="size-4 {open || forceOpen || isSearching ? 'rotate-90' : ''}"
        />
        {name}
      </button>
    {:else}
      {name}
    {/if}
  </h3>

  <div id={`${instance}-rows`} hidden={!expanded}>
    {#if expanded}
      {#if families.length === 1}
        <p class="single-source">{sourceFilterLabel(families[0].id, locale)}</p>
      {/if}
      {#if columns.length > 0 || discovery}
        <div class="timetable">
          {#each columns as column (column.id)}
            <button
              type="button"
              aria-pressed={highlight === column.id}
              onclick={() => (highlight = highlight === column.id ? undefined : column.id)}
            >
              <Icon.Source type={column.type} class="size-4" />
              {sourceFilterLabel(column.id, locale)}
            </button>
          {/each}
          {#if discovery}
            <span>Undiscovered sources</span>
          {/if}
        </div>
      {/if}
      {#each shelves as shelf (shelf)}
        {@const entries = groups[shelf]}
        {#if entries.length > 0}
          {#if shelf === "todo"}
            {#if explains}
              <ShelfHeading {shelf} count={entries.length} level={4} />
            {:else}
              <p class="shelf-heading">{shelfLabel(shelf)} · {entries.length}</p>
            {/if}
            {@render shelfRows(entries, shelf)}
          {:else}
            <details open={forceOpen && shelf === "completed"}>
              <summary>
                {shelfLabel(shelf)} ·
                {#if isSearching}
                  {plural(entries.length, [`${entries.length} match`, `${entries.length} matches`])}
                {:else}
                  {entries.length}
                {/if}
              </summary>
              {@render shelfRows(entries, shelf)}
            </details>
          {/if}
        {/if}
      {/each}
    {/if}
  </div>
</section>

{#snippet shelfRows(entries: readonly T[], shelf: Shelf)}
  {#if renderRows}
    <div data-tracker-list>
      {#each entries as entry (entry.key)}
        {@const highlighted =
          highlight !== undefined &&
          entry.visibleSources.some(
            (source) =>
              toolbarState.showsSource(source) && ledgerSourceFamily(source) === highlight,
          )}
        {@render row(entry, shelf, columns, discovery, highlighted)}
      {/each}
    </div>
  {/if}
{/snippet}

<style>
  section {
    margin-block: 0.75rem 1.5rem;
    scroll-margin-block-start: var(--ledger-anchor-offset, 7rem);
    border-block-start: 2px solid var(--color-ink-hairline);
  }

  h3 {
    padding-block: 0.6rem 0.25rem;
    font-family: var(--font-brand);
    font-size: var(--text-xl);
    line-height: 1.2;
  }

  h3 button,
  .timetable button {
    display: inline-flex;
    min-block-size: 44px;
    align-items: center;
    gap: 0.35rem;
    text-align: start;
  }

  .single-source,
  .shelf-heading,
  summary,
  .timetable {
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-sm);
  }

  .single-source,
  .shelf-heading {
    padding-block: 0.35rem;
  }

  .timetable {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    column-gap: 0.65rem;
    border-block-end: 1px solid var(--color-ink-hairline);
  }

  .timetable button[aria-pressed="true"] {
    color: var(--color-guide-voice);
    text-decoration: underline;
    text-underline-offset: 0.25em;
  }

  @media (min-width: 60rem) {
    .timetable {
      column-gap: 0.35rem;
    }

    .timetable button {
      inline-size: 6rem;
      justify-content: center;
      text-align: center;
    }

    .timetable > span {
      inline-size: 8rem;
      text-align: center;
    }
  }

  details {
    border-block-start: 1px dashed var(--color-ink-hairline);
  }

  summary {
    min-block-size: 44px;
    padding-block: 0.65rem;
    cursor: pointer;
  }
</style>
