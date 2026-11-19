<script lang="ts" generics="T extends LedgerPlacement & { key: string; obtainable: boolean }">
  import { tick, untrack } from "svelte";

  import { Icon, SOURCE_FILTER_ICON } from "#lib/components/icon/index.js";
  import ShelfHeading from "#lib/components/shelf-heading.svelte";
  import { sourceFilterLabel } from "#lib/data/source-filters.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { ledgerShelf, ledgerSourceFamily } from "#lib/presentation/ledger.js";
  import { shelfLabel } from "#lib/presentation/shelves.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";

  import type { Snippet } from "svelte";

  import type { SourceFilterId } from "#lib/data/source-filters.js";
  import type { Shelf } from "#lib/engine/shelves.js";
  import type { LedgerPlacement } from "#lib/presentation/ledger.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  let {
    collapsible = false,
    contextualFamily,
    explains = false,
    forceOpen = false,
    id,
    locale,
    name,
    progress,
    row,
    rows,
    visible,
  }: {
    collapsible?: boolean;
    contextualFamily?: SourceFilterId;
    explains?: boolean;
    forceOpen?: boolean;
    id?: string;
    locale: LocaleCode;
    name: string;
    progress?: { completed: number; total: number };
    row: Snippet<
      [T, Shelf, readonly SourceFilterId[], boolean, boolean, boolean, (event: Event) => void]
    >;
    /** Every placement at the last refresh, including the rows filters can bring back. */
    rows: readonly T[];
    visible: (entry: T) => boolean;
  } = $props();

  const shelves: readonly Shelf[] = ["todo", "notNow", "completed"];
  const instance = $props.id();
  let open = $state(untrack(() => !collapsible));
  // Every shelf a Find match revealed stays open, so a later match elsewhere doesn't close it.
  const revealedShelves = $state<Partial<Record<Shelf, true>>>({});
  const highlights = $state<Partial<Record<Shelf, SourceFilterId>>>({});
  let groups = $derived.by(() => {
    const grouped: Record<Shelf, T[]> = { completed: [], notNow: [], todo: [] };
    for (const entry of rows) {
      if (
        (entry.obtainable || toolbarState.showUnobtainable) &&
        toolbarState.matchesSourceFilters(entry.sources)
      ) {
        grouped[ledgerShelf(entry, toolbarState.showsSource)].push(entry);
      }
    }
    return grouped;
  });
  let matches = $derived({
    completed: groups.completed.filter(visible),
    notNow: groups.notNow.filter(visible),
    todo: groups.todo.filter(visible),
  });
  let isSearching = $derived(Boolean(toolbarState.searchQuery));
  let hasRows = $derived(shelves.some((shelf) => matches[shelf].length > 0));
  let expanded = $derived(open || forceOpen || isSearching);

  async function revealFindMatch(event: Event, shelf: Shelf): Promise<void> {
    const target = event.currentTarget;
    open = true;
    revealedShelves[shelf] = true;
    await tick();
    if (target instanceof HTMLElement) target.scrollIntoView({ block: "center" });
  }

  function timetable(entries: readonly T[]): SourceFilterId[] {
    // Search hides rows, but the shelf's headings still describe the whole filtered shelf.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch counts for this snapshot.
    const counts = new Map<SourceFilterId, number>();
    for (const entry of entries) {
      const families = new Set(
        entry.visibleSources.flatMap((source) =>
          toolbarState.showsSource(source) ? [ledgerSourceFamily(source)] : [],
        ),
      );
      for (const family of families) {
        if (family && family !== contextualFamily) {
          counts.set(family, (counts.get(family) ?? 0) + 1);
        }
      }
    }
    const ranked = [...counts]
      .toSorted(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b))
      .slice(0, 3);
    // In a place, alternate sources earn a column when they cover a quarter of the shelf.
    // Keep the most common alternative if none reach that share.
    return ranked
      .filter(([, count], index) => !collapsible || index === 0 || count * 4 >= entries.length)
      .map(([family]) => family);
  }
</script>

<section {id} data-ledger-section hidden={!hasRows} aria-labelledby={`${instance}-heading`}>
  <h3 id={`${instance}-heading`} tabindex="-1">
    {#if collapsible}
      <button
        type="button"
        data-section-trigger
        aria-expanded={expanded}
        aria-labelledby={`${instance}-name`}
        aria-describedby={progress ? `${instance}-remaining ${instance}-progress` : undefined}
        aria-controls={`${instance}-rows`}
        onclick={() => (open = !open)}
      >
        <Icon.UI
          type="disclosure"
          class="size-4 {open || forceOpen || isSearching ? 'rotate-90' : ''}"
        />
        <span id={`${instance}-name`}>{name}</span>
        {#if progress}
          {@const count = formatNumber(groups.todo.length, locale)}
          <span class="remaining" id={`${instance}-remaining`}
            >{plural(groups.todo.length, [`${count} to do`, `${count} to do`])}</span
          >
        {/if}
      </button>
    {:else}
      {name}
    {/if}
  </h3>
  {#if progress}
    {@const completed = formatNumber(progress.completed, locale)}
    {@const total = formatNumber(progress.total, locale)}
    <p class="section-progress" id={`${instance}-progress`}>
      <span class="sr-only">{`${completed} of ${total} completed`}</span>
      <span aria-hidden="true">{completed} / {total}</span>
    </p>
  {/if}

  <div
    id={`${instance}-rows`}
    hidden={expanded ? undefined : "until-found"}
    onbeforematch={() => (open = true)}
  >
    {#each shelves as shelf (shelf)}
      {@const entries = matches[shelf]}
      {#if entries.length > 0}
        {#if shelf === "todo"}
          {#if expanded}<ShelfHeading
              {shelf}
              {explains}
              count={collapsible && progress && !isSearching ? undefined : entries.length}
              level={4}
            />{/if}
          {@render shelfRows(entries, shelf)}
        {:else}
          <details open={revealedShelves[shelf] === true || (forceOpen && shelf === "completed")}>
            <summary class:completed={shelf === "completed"} data-shelf-heading={shelf}>
              {#if expanded}
                <Icon.UI type="disclosure" class="shelf-chevron size-3.5 shrink-0" />
                {#if shelf === "completed"}<Icon.Category
                    category="complete"
                    class="size-3.5"
                  />{/if}
                <span>{shelfLabel(shelf)}</span>
                <span class="shelf-count">
                  {#if isSearching}
                    {@const count = formatNumber(entries.length, locale)}
                    {plural(entries.length, [`${count} match`, `${count} matches`])}
                  {:else}
                    {formatNumber(entries.length, locale)}
                  {/if}
                </span>
              {/if}
            </summary>
            {@render shelfRows(entries, shelf)}
          </details>
        {/if}
      {/if}
    {/each}
  </div>
</section>

{#snippet shelfRows(entries: readonly T[], shelf: Shelf)}
  {@const columns = expanded ? timetable(groups[shelf]) : []}
  {@const discovery = expanded && groups[shelf].some((entry) => entry.hiddenCount > 0)}
  {@const highlight = highlights[shelf]}
  {#if columns.length > 0 || discovery}
    <div class="timetable">
      {#each columns as family (family)}
        {@const FamilyIcon = SOURCE_FILTER_ICON[family]}
        {@const label = sourceFilterLabel(family, locale)}
        <button
          type="button"
          aria-label={`Highlight rows from ${label}`}
          aria-pressed={highlight === family}
          onclick={() => (highlights[shelf] = highlight === family ? undefined : family)}
        >
          <FamilyIcon class="size-4 shrink-0" />
          <span>{label}</span>
        </button>
      {/each}
      {#if discovery}
        <span>Undiscovered sources</span>
      {/if}
    </div>
  {/if}
  <div data-tracker-list>
    {#each entries as entry (entry.key)}
      {@const highlighted =
        highlight !== undefined &&
        columns.includes(highlight) &&
        entry.visibleSources.some(
          (source) => toolbarState.showsSource(source) && ledgerSourceFamily(source) === highlight,
        )}
      {@render row(
        entry,
        shelf,
        columns,
        discovery,
        highlighted,
        expanded,
        (event) => void revealFindMatch(event, shelf),
      )}
    {/each}
  </div>
{/snippet}

<style>
  section {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    column-gap: 0.75rem;
    margin-block: 0.75rem 1.5rem;
    scroll-margin-block-start: var(--ledger-anchor-offset, 7rem);
    border-block-start: 2px solid var(--color-ink-hairline);
  }

  section[hidden] {
    display: none;
  }

  section > div {
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  h3 {
    padding-block: 0.6rem 0.25rem;
    font-family: var(--font-brand);
    font-size: var(--text-xl);
    line-height: 1.2;
  }

  h3:focus-visible,
  h3:focus-visible button > span:first-of-type {
    outline: none;
    text-decoration: underline;
    text-decoration-color: var(--color-guide-voice);
    text-underline-offset: 0.25em;
  }

  h3 button,
  .timetable button {
    display: inline-flex;
    min-block-size: 44px;
    align-items: center;
    gap: 0.35rem;
    text-align: start;
  }

  .remaining,
  .section-progress,
  .timetable {
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-sm);
  }

  h3 button {
    flex-wrap: wrap;
  }

  .remaining {
    margin-inline-start: 0.25rem;
    color: var(--color-guide-voice);
  }

  .section-progress,
  .shelf-count {
    font-family: var(--font-data);
    font-size: var(--text-xs);
    letter-spacing: 0;
    white-space: nowrap;
  }

  .timetable {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    align-items: center;
    column-gap: 0.65rem;
    border-block-end: 1px solid var(--color-ink-hairline);
  }

  @media (width < 60rem) {
    .timetable {
      gap: 0.25rem 0.5rem;
      padding-block: 0.25rem;
    }

    .timetable button {
      padding-inline: 0.55rem;
      border: 1px solid var(--color-ink-hairline);
      border-radius: var(--radius);
    }

    .timetable > span {
      display: none;
    }

    .timetable:not(:has(button)) {
      display: none;
    }
  }

  .timetable button[aria-pressed="true"] {
    color: var(--color-guide-voice);
    text-decoration: underline;
    text-underline-offset: 0.25em;
  }

  @media (min-width: 60rem) {
    .timetable {
      justify-content: flex-end;
      column-gap: 0.35rem;
    }

    .timetable button {
      inline-size: 6rem;
      flex-direction: column;
      justify-content: center;
      gap: 0.125rem;
      padding-block: 0.25rem;
      text-align: center;
    }

    .timetable button span {
      min-inline-size: 0;
      overflow-wrap: anywhere;
      hyphens: auto;
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
    display: flex;
    min-block-size: 44px;
    align-items: center;
    gap: 0.375rem;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-2xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary.completed {
    color: var(--color-progress-complete);
  }

  details[open] summary :global(.shelf-chevron) {
    transform: rotate(90deg);
  }

  .shelf-count {
    margin-inline-start: auto;
  }
</style>
