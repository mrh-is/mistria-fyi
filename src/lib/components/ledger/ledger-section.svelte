<script lang="ts" generics="T extends LedgerPlacement & { key: string; obtainable: boolean }">
  import { tick, untrack } from "svelte";

  import { Icon, SOURCE_FILTER_ICON } from "#lib/components/icon/index.js";
  import {
    getLedgerIndexContext,
    LEDGER_ARRIVAL_EVENT,
    LEDGER_MOUNT_EVENT,
    setLedgerSectionContext,
  } from "#lib/components/ledger/ledger-context.js";
  import {
    REVEAL_ROWS,
    viewportWindow,
    windowAround,
  } from "#lib/components/ledger/ledger-row-window.js";
  import ShelfHeading from "#lib/components/shelf-heading.svelte";
  import { sourceFilterLabel } from "#lib/data/source-filters.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { ledgerColumn, ledgerColumnFamily, ledgerShelf } from "#lib/presentation/ledger.js";
  import { shelfLabel } from "#lib/presentation/shelves.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";

  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";

  import type { RowWindow } from "#lib/components/ledger/ledger-row-window.js";
  import type { SourceFilterId } from "#lib/data/source-filters.js";
  import type { Shelf } from "#lib/engine/shelves.js";
  import type { LedgerColumn, LedgerPlacement } from "#lib/presentation/ledger.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  let {
    categoryDetails = false,
    collapsible = false,
    contents,
    contextualFamily,
    countsRow = () => true,
    covered = false,
    divider = false,
    explains = false,
    folded = false,
    id,
    locale,
    name,
    onReveal,
    open = $bindable(untrack(() => !collapsible && !folded)),
    openOnArrival = false,
    place = false,
    progress,
    row,
    rows,
    subsection = false,
    visible,
  }: {
    categoryDetails?: boolean;
    collapsible?: boolean;
    contents?: Snippet;
    contextualFamily?: SourceFilterId;
    countsRow?: (entry: T) => boolean;
    covered?: boolean;
    /** Draws the sprig divider above this section; the parent passes `index > 0`. */
    divider?: boolean;
    explains?: boolean;
    /**
     * Prints the section as one index-style line (name, leader, & count) until the reader opens it,
     * as finished sections & every section on a phone do.
     */
    folded?: boolean;
    id?: string;
    locale: LocaleCode;
    name: string;
    onReveal?: () => void;
    /** Whether the reader opened the section. Bind it to keep the choice across a Back visit. */
    open?: boolean;
    /** Opens the section when its fragment becomes the navigation target. */
    openOnArrival?: boolean;
    place?: boolean;
    progress?: { completed: number; total: number };
    row: Snippet<
      [
        T,
        Shelf,
        readonly LedgerColumn[],
        boolean,
        boolean,
        boolean,
        (event: Event) => void,
        boolean,
      ]
    >;
    /** Every placement at the last refresh, including the rows filters can bring back. */
    rows: readonly T[];
    subsection?: boolean;
    visible: (entry: T) => boolean;
  } = $props();

  const shelves: readonly Shelf[] = ["todo", "notNow", "completed"];
  const instance = $props.id();
  const index = getLedgerIndexContext();
  setLedgerSectionContext({
    get categoryDetails() {
      return categoryDetails;
    },
    get contextualFamily() {
      return contextualFamily;
    },
  });
  const SPRIG_COUNT = 6;
  // Every shelf a Find match revealed stays open, so a later match elsewhere doesn't close it.
  const revealedShelves = $state<Partial<Record<Shelf, boolean>>>({});
  const highlights = $state<Partial<Record<Shelf, LedgerColumn>>>({});
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
    // Spoilered rows gather at their shelf's foot, so an alphabetical slot can't hint at a name.
    if (!userState.state.showSpoilers) {
      for (const shelf of shelves) {
        grouped[shelf] = [
          ...grouped[shelf].filter((entry) => !entry.spoilered),
          ...grouped[shelf].filter((entry) => entry.spoilered),
        ];
      }
    }
    return grouped;
  });
  let isSearching = $derived(Boolean(toolbarState.searchQuery));
  let matches = $derived(
    isSearching
      ? {
          completed: groups.completed.filter(visible),
          notNow: groups.notNow.filter(visible),
          todo: groups.todo.filter(visible),
        }
      : groups,
  );
  let hasRows = $derived(shelves.some((shelf) => matches[shelf].length > 0));
  let todoCount = $derived(groups.todo.filter(countsRow).length);
  let expanded = $derived(open || isSearching);
  let showTable = $derived(open || (isSearching && hasRows));
  /**
   * A search that matches only one closed shelf here (Not now or Completed) prints as one line
   * that opens it, so a phone doesn't spend a screen on heads, folds, & dividers.
   */
  let soleClosedShelf = $derived.by((): Shelf | undefined => {
    if (!isSearching || collapsible || contents || subsection) return undefined;
    const found = shelves.filter((shelf) => matches[shelf].length > 0);
    const [shelf] = found;
    if (found.length !== 1 || shelf === undefined || shelf === "todo") return undefined;
    if (shelfOpen(shelf)) return undefined;
    return shelf;
  });
  let line = $derived(
    covered || soleClosedShelf !== undefined || ((folded || subsection) && !expanded),
  );
  let headHeight = $state(0);

  /*
   * The head's height from the observer's own measurement. `bind:offsetHeight` reads layout in each
   * callback, which forces a layout per section on a page with hundreds of them.
   */
  function measureHead(element: HTMLElement): () => void {
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize[0]?.blockSize;
      if (height !== undefined && height > 0) headHeight = height;
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }

  /*
   * A finished section has nothing on To do, so once it's opened, the shelf holding its rows opens
   * too. It's derived from `open`, so a section restored open by Back shows its rows as well.
   */
  let openedShelf = $derived(
    folded && open && matches.todo.length === 0
      ? shelves.find((shelf) => matches[shelf].length > 0)
      : undefined,
  );

  async function openFromLine(): Promise<void> {
    if (soleClosedShelf) revealShelf(soleClosedShelf);
    open = true;
    await tick();
    head?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  }

  async function fold(): Promise<void> {
    open = false;
    await tick();
    const heading = head?.querySelector<HTMLElement>("h3");
    // Folding from deep in a long section leaves its line above the screen, so bring it back.
    if (head && head.getBoundingClientRect().top < 0) head.scrollIntoView({ block: "center" });
    heading?.focus({ preventScroll: true });
  }

  // Keep a bounded set of reading rows mounted while a search temporarily hides them.
  const readingWindows = $state<Partial<Record<Shelf, RowWindow>>>({});
  const searchWindows = $state<Partial<Record<Shelf, RowWindow>>>({});
  $effect.pre(() => {
    void toolbarState.searchQuery;
    for (const shelf of shelves) searchWindows[shelf] = undefined;
  });

  /*
   * Whether the reader last opened or closed each shelf with its summary. It overrides the shelf's
   * default until something reveals the shelf, and it outlives the fold, so a search that prints
   * the shelf as one line hands it back as the reader left it.
   */
  const toggledOpen = $state<Record<Shelf, boolean | undefined>>({
    completed: undefined,
    notNow: undefined,
    todo: undefined,
  });

  function revealShelf(shelf: Shelf): void {
    revealedShelves[shelf] = true;
    toggledOpen[shelf] = undefined;
  }

  function openLinkedSection(): void {
    if (!open) open = true;
    if (toggledOpen.completed === undefined) revealedShelves.completed = true;
  }

  $effect(() => {
    if (openOnArrival) untrack(openLinkedSection);
  });

  /** Whether a fold is open: the reader's last toggle, or else what revealed or forced it. */
  function shelfOpen(shelf: Shelf): boolean {
    return toggledOpen[shelf] ?? (revealedShelves[shelf] === true || openedShelf === shelf);
  }

  async function toggleShelf(event: Event, shelf: Shelf): Promise<void> {
    const details = event.currentTarget;
    if (!(details instanceof HTMLDetailsElement)) return;
    const opened = details.open;
    if (opened === shelfOpen(shelf)) return;
    const focused = details.contains(document.activeElement);
    toggledOpen[shelf] = opened;
    if (!opened) revealedShelves[shelf] = false;
    scheduleShelfRead();
    if (!opened && focused && line) {
      await tick();
      const active = document.activeElement;
      if (line && (active === document.body || details.contains(active))) {
        head?.querySelector<HTMLElement>(".line-button")?.focus({ preventScroll: true });
      }
    }
  }

  function shelfShown(shelf: Shelf): boolean {
    if (!expanded || line) return false;
    return shelf === "todo" || shelfOpen(shelf);
  }

  // Search can expand hundreds of places. Only explicit opens seed a window before layout.
  const wasShown = untrack((): Record<Shelf, boolean> => ({
    completed: false,
    notNow: false,
    todo: !collapsible && !folded,
  }));
  $effect.pre(() => {
    const duringSearch = isSearching;
    const opened = open;
    for (const shelf of shelves) {
      const shown = shelfShown(shelf);
      if (shown && !wasShown[shelf] && (opened || shelf !== "todo")) {
        untrack(() => {
          if (duringSearch) {
            searchWindows[shelf] ??= { start: 0, end: REVEAL_ROWS };
          } else {
            readingWindows[shelf] ??= { start: 0, end: REVEAL_ROWS };
          }
        });
      }
      wasShown[shelf] = shown;
    }
  });

  function rowWindow(shelf: Shelf): RowWindow {
    const window = (isSearching ? searchWindows : readingWindows)[shelf];
    const count = matches[shelf].length;
    return { start: Math.min(window?.start ?? 0, count), end: Math.min(window?.end ?? 0, count) };
  }

  // A focused row the window has scrolled past stays mounted, so focus never falls to the body.
  const focusedRows = $state<Partial<Record<Shelf, string>>>({});

  function mountedEntries(shelf: Shelf, onScreen: readonly T[]): T[] {
    const kept = isSearching ? readingWindows[shelf] : undefined;
    const focused = focusedRows[shelf];
    const keys = new Set(onScreen.map(({ key }) => key));
    if (!kept && (focused === undefined || keys.has(focused))) return [...onScreen];
    return groups[shelf].filter(
      (entry, rowIndex) =>
        (kept !== undefined && rowIndex >= kept.start && rowIndex < kept.end) ||
        keys.has(entry.key) ||
        entry.key === focused,
    );
  }

  function focusedRowKey(element: HTMLElement): string | undefined {
    const active = document.activeElement;
    if (!active || !element.contains(active)) return undefined;
    return active.closest<HTMLElement>("[data-ledger-key]")?.dataset.ledgerKey;
  }

  /** Watch the entire shelf, so a jump can mount rows in the middle of either spacer. */
  function watchRows(shelf: Shelf, count: number, query: string): Attachment<HTMLElement> {
    return (element) => {
      const windows = query ? searchWindows : readingWindows;
      const before = element.querySelector<HTMLElement>("[data-rows-before]");
      const after = element.querySelector<HTMLElement>("[data-rows-after]");
      if (!before || !after) return;
      const listeners = new AbortController();
      let nearby = false;
      let frame: number | undefined;

      function measure(): void {
        frame = undefined;
        if (!before || !after || !nearby) return;
        const leading = before.getBoundingClientRect();
        const trailing = after.getBoundingClientRect();
        const estimate = Number(getComputedStyle(element).getPropertyValue("--ledger-row-pixels"));
        if (!(estimate > 0)) return;
        const current = untrack(() => rowWindow(shelf));
        const next = viewportWindow(
          count,
          current,
          leading.top,
          leading.bottom,
          trailing.top,
          estimate,
          globalThis.innerHeight,
        );
        if (!next && element.contains(document.activeElement)) return;
        const focused = focusedRowKey(element);
        if (focusedRows[shelf] !== focused) focusedRows[shelf] = focused;
        if (windows[shelf]?.start === next?.start && windows[shelf]?.end === next?.end) return;
        windows[shelf] = next;
      }

      function schedule(): void {
        frame ??= requestAnimationFrame(measure);
      }

      const resize = new ResizeObserver(schedule);
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          nearby = entry.isIntersecting;
          if (nearby) {
            globalThis.addEventListener("scroll", schedule, {
              passive: true,
              signal: listeners.signal,
            });
            globalThis.addEventListener("resize", schedule, { signal: listeners.signal });
            resize.observe(element);
            schedule();
          } else {
            globalThis.removeEventListener("scroll", schedule);
            globalThis.removeEventListener("resize", schedule);
            resize.unobserve(element);
            if (!element.contains(document.activeElement)) windows[shelf] = undefined;
          }
        },
        { rootMargin: "100% 0px" },
      );
      observer.observe(element);
      return () => {
        observer.disconnect();
        resize.disconnect();
        listeners.abort();
        if (frame !== undefined) cancelAnimationFrame(frame);
      };
    };
  }

  /** Mount the window containing the restored row before the scroll controller measures it. */
  function mountThrough(key: string): void {
    for (const shelf of shelves) {
      const rowIndex = groups[shelf].findIndex((entry) => entry.key === key);
      if (rowIndex === -1) continue;
      // Writing an unchanged open value runs the page's history setter during its restore.
      if (!open) open = true;
      if (shelf !== "todo") revealShelf(shelf);
      const window = readingWindows[shelf];
      if (!window || rowIndex < window.start || rowIndex >= window.end) {
        readingWindows[shelf] = windowAround(rowIndex, groups[shelf].length);
      }
      return;
    }
  }

  async function focusPage(event: MouseEvent, shelf: Shelf, rowIndex: number): Promise<void> {
    const trigger = event.currentTarget;
    const entries = matches[shelf];
    const entry = entries[rowIndex];
    if (!(trigger instanceof HTMLElement) || !entry) return;
    const list = trigger.closest(".row-window");
    const windows = isSearching ? searchWindows : readingWindows;
    windows[shelf] = windowAround(rowIndex, entries.length);
    await tick();
    const target = list?.querySelector(`[data-ledger-key="${CSS.escape(entry.key)}"]`);
    target?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: "instant", block: "center" });
  }

  function onMountRequest(event: Event): void {
    if (event instanceof CustomEvent && typeof event.detail === "string") {
      mountThrough(event.detail);
    }
  }

  function listenForLedgerRequests(element: HTMLElement): () => void {
    element.addEventListener(LEDGER_MOUNT_EVENT, onMountRequest);
    element.addEventListener(LEDGER_ARRIVAL_EVENT, openLinkedSection);
    return () => {
      element.removeEventListener(LEDGER_MOUNT_EVENT, onMountRequest);
      element.removeEventListener(LEDGER_ARRIVAL_EVENT, openLinkedSection);
    };
  }

  /*
   * The stuck head names the shelf passing under it, as in “Furniture · Completed 159”, but only
   * while that shelf is open: a closed fold names itself, so the head keeps the To do count.
   */
  let head = $state<HTMLElement>();
  let sectionElement = $state<HTMLElement>();
  let stuck = $state(false);
  let shelvesElement = $state<HTMLElement>();
  let shelfInView = $state<Shelf>("todo");
  let headShelf = $derived(matches[shelfInView].length > 0 ? shelfInView : "todo");
  let frame: number | undefined;

  function readShelfInView(): void {
    frame = undefined;
    if (!head || !shelvesElement) return;
    if (categoryDetails && index?.jumpList && sectionElement) {
      const top = head.getBoundingClientRect().top;
      const stickyTop = Number(getComputedStyle(head).top.replace("px", ""));
      stuck =
        Math.abs(top - stickyTop) <= 1 && sectionElement.getBoundingClientRect().top < top - 1;
    }
    if (contents) return;
    const stuckLine = head.getBoundingClientRect().bottom + 1;
    let next: Shelf = "todo";
    for (const element of shelvesElement.querySelectorAll<HTMLElement>("[data-shelf]")) {
      if (element instanceof HTMLDetailsElement && !element.open) continue;
      if (element.getBoundingClientRect().top <= stuckLine) next = element.dataset.shelf as Shelf;
    }
    shelfInView = next;
  }

  function scheduleShelfRead(): void {
    if (collapsible || subsection || line) return;
    frame ??= requestAnimationFrame(readShelfInView);
  }

  $effect(() => () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
  });
  // A stable sprig per section, so filtering never reshuffles them.
  let sprig = $derived(
    [...(id ?? name)].reduce((hash, char) => (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0, 7) %
      SPRIG_COUNT,
  );

  async function revealFindMatch(event: Event, shelf: Shelf): Promise<void> {
    const target = event.currentTarget;
    open = true;
    revealShelf(shelf);
    await tick();
    if (target instanceof HTMLElement) target.scrollIntoView({ block: "center" });
  }

  function timetable(entries: readonly T[]): LedgerColumn[] {
    // Search hides rows, but the shelf's headings still describe the whole filtered shelf.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch counts for this snapshot.
    const counts = new Map<LedgerColumn, number>();
    for (const entry of entries) {
      const families = new Set(
        entry.visibleSources.flatMap((source) =>
          toolbarState.showsSource(source) ? [ledgerColumn(source, categoryDetails)] : [],
        ),
      );
      for (const family of families) {
        if (family && ledgerColumnFamily(family) !== contextualFamily) {
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
      .filter(([, count], rank) => !collapsible || rank === 0 || count * 4 >= entries.length)
      .map(([family]) => family);
  }

  /**
   * Whether a family's column head can highlight anything: only when it picks out some of the
   * shelf's rows, not none or all of them.
   */
  function columnLabel(column: LedgerColumn): string {
    switch (column) {
      case "wing":
        return "Wing";
      case "bundle":
        return "Bundle";
      case "price":
        return "Price";
      default:
        return sourceFilterLabel(column, locale);
    }
  }

  function picksOut(entries: readonly T[], family: LedgerColumn): boolean {
    let count = 0;
    for (const entry of entries) {
      if (
        entry.visibleSources.some(
          (source) =>
            toolbarState.showsSource(source) && ledgerColumn(source, categoryDetails) === family,
        )
      ) {
        count += 1;
      }
    }
    return count > 0 && count < entries.length;
  }

  /**
   * The wide table's tracks: checkbox, sprite, name, each source, discovery, & the slack. Source
   * columns grow toward 20rem before the slack takes any width, so cells wrap only when the page
   * runs out of room.
   */
  function gridTracks(columns: number, discovery: boolean): string {
    return [
      "var(--ledger-check-size, 44px) 30px minmax(12rem, 20rem)",
      ...Array.from({ length: columns }, () => "minmax(7rem, 20rem)"),
      discovery ? "6rem" : "",
      "minmax(0, 1fr)",
    ]
      .filter(Boolean)
      .join(" ");
  }
</script>

<svelte:window onscroll={scheduleShelfRead} onresize={scheduleShelfRead} />

<section
  {id}
  bind:this={sectionElement}
  data-ledger-section
  data-divider={(divider && !line) || undefined}
  data-ledger-searching={isSearching || undefined}
  data-sprig={sprig}
  class:collapsible
  class:line
  class:subsection
  class:place
  hidden={covered ? isSearching : !hasRows}
  aria-labelledby={`${instance}-name`}
  style:--ledger-head-measured={headHeight ? `${headHeight}px` : undefined}
  {@attach listenForLedgerRequests}
>
  <div class="head" data-ledger-head bind:this={head} {@attach measureHead}>
    <h3 id={`${instance}-heading`} tabindex="-1">
      {#if covered}
        <button type="button" class="line-button" onclick={onReveal}>
          <span id={`${instance}-name`} class="sr-only">Reveal spoilered section</span>
          <span class="section-blank" aria-hidden="true"></span>
          <span class="leader" aria-hidden="true"></span>
          <span class="line-count" aria-hidden="true">? / ?</span>
        </button>
      {:else if line}
        <button
          type="button"
          class="line-button"
          data-section-trigger
          aria-expanded="false"
          aria-labelledby={`${instance}-name`}
          aria-describedby={`${instance}-line-count`}
          aria-controls={`${instance}-rows`}
          onclick={() => void openFromLine()}
        >
          <span class="line-name" id={`${instance}-name`}>{name}</span>
          {#if soleClosedShelf}
            <span class="line-shelf">
              {#if soleClosedShelf === "completed"}<Icon.Category
                  category="complete"
                  class="size-3.5"
                />{/if}
              {shelfLabel(soleClosedShelf)}
            </span>
          {/if}
          <span class="leader" aria-hidden="true"></span>
          <span class="line-count" id={`${instance}-line-count`}>
            {#if soleClosedShelf}
              {@const found = matches[soleClosedShelf].length}
              {@const count = formatNumber(found, locale)}
              {plural(found, [`${count} match`, `${count} matches`])}
            {:else if progress}
              {@const completed = formatNumber(progress.completed, locale)}
              {@const total = formatNumber(progress.total, locale)}
              <span class="sr-only">{`${completed} of ${total} completed`}</span>
              <span aria-hidden="true"><span class="hand">{completed}</span> / {total}</span>
            {/if}
          </span>
        </button>
      {:else if collapsible}
        <button
          type="button"
          data-section-trigger
          aria-expanded={expanded}
          aria-labelledby={`${instance}-name`}
          aria-describedby={progress ? `${instance}-remaining ${instance}-progress` : undefined}
          aria-controls={`${instance}-rows`}
          onclick={() => (open = !open)}
        >
          <Icon.UI type="disclosure" class="size-4 {expanded ? 'rotate-90' : ''}" />
          <span id={`${instance}-name`}>{name}</span>
          {#if progress}
            {@const count = formatNumber(todoCount, locale)}
            <span class="remaining" class:sr-only={place && expanded} id={`${instance}-remaining`}
              >{plural(todoCount, [`${count} to do`, `${count} to do`])}</span
            >
          {/if}
        </button>
      {:else if (folded || subsection) && open && !isSearching}
        <!-- An opened line folds back to itself, so a phone returns to the list in place. -->
        <button
          type="button"
          data-section-trigger
          aria-expanded="true"
          aria-labelledby={`${instance}-name`}
          aria-describedby={progress ? `${instance}-progress` : undefined}
          aria-controls={`${instance}-rows`}
          onclick={() => void fold()}
        >
          <span id={`${instance}-name`}>{name}</span>
          <Icon.UI type="disclosure" class="size-3.5 rotate-90" />
        </button>
      {:else if index?.jumpList && !categoryDetails}
        <!-- On phones the section's own head opens the jump list, since there's no index rail. -->
        <button
          type="button"
          class="jump"
          popovertarget={index.jumpList}
          aria-describedby={`${instance}-jump`}
        >
          <span id={`${instance}-name`}>{name}</span>
          <Icon.UI type="disclosure" class="size-3.5 rotate-90" />
        </button>
      {:else}
        <span id={`${instance}-name`}>{name}</span>
      {/if}
    </h3>
    {#if categoryDetails && !line && !subsection && index?.jumpList && stuck}
      <button class="sections-jump" type="button" popovertarget={index.jumpList}>Sections</button>
    {/if}
    <!-- Describes the head's button without becoming part of the section's name. -->
    <span id={`${instance}-jump`} hidden>Jump to a section</span>
    {#if progress && !line}
      {@const completed = formatNumber(progress.completed, locale)}
      {@const total = formatNumber(progress.total, locale)}
      <p class="section-progress" id={`${instance}-progress`}>
        <span class="sr-only">{`${completed} of ${total} completed`}</span>
        <span aria-hidden="true"><span class="hand">{completed}</span> / {total}</span>
      </p>
    {/if}
    {#if (!collapsible || (place && expanded)) && !line && !contents && matches[headShelf].length > 0}
      {#key headShelf}
        <ShelfHeading
          class="head-shelf"
          shelf={headShelf}
          explains={explains && headShelf === "todo"}
          count={matches[headShelf].filter(countsRow).length}
          level={4}
        />
      {/key}
    {/if}
  </div>

  {#if !covered}
    <div
      id={`${instance}-rows`}
      class="shelves"
      bind:this={shelvesElement}
      hidden={expanded && !line ? undefined : "until-found"}
      onbeforematch={() => {
        if (soleClosedShelf) revealShelf(soleClosedShelf);
        open = true;
      }}
    >
      {#if contents}
        {#if expanded}{@render contents()}{/if}
      {:else}
        {#each shelves as shelf (shelf)}
          {@const entries = matches[shelf]}
          {@const count = entries.filter(countsRow).length}
          {#if groups[shelf].length > 0}
            {#if shelf === "todo"}
              <div class="shelf" data-shelf={shelf} hidden={entries.length === 0}>
                {#if expanded && collapsible && !place}<ShelfHeading
                    {shelf}
                    {explains}
                    count={progress && !isSearching ? undefined : count}
                    level={4}
                  />{/if}
                {@render shelfRows(shelf)}
              </div>
            {:else}
              <details
                class="shelf"
                data-shelf={shelf}
                hidden={entries.length === 0}
                open={shelfOpen(shelf)}
                ontoggle={(event) => void toggleShelf(event, shelf)}
              >
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
                        {@const label = formatNumber(count, locale)}
                        {plural(count, [`${label} match`, `${label} matches`])}
                      {:else}
                        {formatNumber(count, locale)}
                      {/if}
                    </span>
                  {/if}
                </summary>
                {@render shelfRows(shelf)}
              </details>
            {/if}
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
</section>

{#snippet shelfRows(shelf: Shelf)}
  {@const columns = showTable ? timetable(groups[shelf]) : []}
  {@const discovery = showTable && groups[shelf].some((entry) => entry.hiddenCount > 0)}
  {@const highlight = highlights[shelf]}
  {@const entries = matches[shelf]}
  {@const window = rowWindow(shelf)}
  {@const onScreen = entries.slice(window.start, window.end)}
  {@const visibleKeys = new Set(onScreen.map(({ key }) => key))}
  <div
    class="ledger-table"
    data-tracker-list
    style:--ledger-tracks={gridTracks(columns.length, discovery)}
    data-has-timetable={columns.length > 0 || undefined}
  >
    {#if columns.length > 0}
      <div class="timetable">
        <span class="name-head">Name</span>
        {#each columns as family, column (family)}
          {@const FamilyIcon = SOURCE_FILTER_ICON[ledgerColumnFamily(family)]}
          {@const label = columnLabel(family)}
          {#if picksOut(groups[shelf], family)}
            <button
              type="button"
              class="column-head"
              class:first={column === 0}
              aria-label={`Highlight rows from ${label}`}
              aria-pressed={highlight === family}
              onclick={() => (highlights[shelf] = highlight === family ? undefined : family)}
            >
              <FamilyIcon class="size-3.5 shrink-0" />
              <span>{label}</span>
            </button>
          {:else}
            <!-- Every row (or none) shares this family, so there's nothing to pick out. -->
            <span class="column-head" class:first={column === 0}>
              <FamilyIcon class="size-3.5 shrink-0" />
              <span>{label}</span>
            </span>
          {/if}
        {/each}
      </div>
    {/if}
    {#if shelfShown(shelf)}
      <div
        class="row-window"
        data-has-more={window.end < entries.length || undefined}
        {@attach entries.length > 0
          ? watchRows(shelf, entries.length, toolbarState.searchQuery)
          : undefined}
      >
        <div class="row-spacer" data-rows-before style:--unmounted={window.start}>
          {#if window.start > 0}
            <button
              class="row-page previous"
              type="button"
              onclick={(event) => void focusPage(event, shelf, window.start - 1)}
              >Previous rows</button
            >
          {/if}
        </div>
        {#each mountedEntries(shelf, onScreen) as entry (entry.key)}
          {@const highlighted =
            highlight !== undefined &&
            columns.includes(highlight) &&
            // A head that turned into a label can't be pressed off, so its highlight lapses.
            picksOut(groups[shelf], highlight) &&
            entry.visibleSources.some(
              (source) =>
                toolbarState.showsSource(source) &&
                ledgerColumn(source, categoryDetails) === highlight,
            )}
          {@render row(
            entry,
            shelf,
            columns,
            discovery,
            highlighted,
            open || (isSearching && visible(entry)),
            (event) => void revealFindMatch(event, shelf),
            isSearching && !visibleKeys.has(entry.key),
          )}
        {/each}
        <div class="row-spacer" data-rows-after style:--unmounted={entries.length - window.end}>
          {#if window.end > 0 && window.end < entries.length}
            <button
              class="row-page next"
              type="button"
              onclick={(event) => void focusPage(event, shelf, window.end)}>Next rows</button
            >
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/snippet}

<style>
  /*
   * Section dividers: a muted sprig between tapering hairlines, centered in the gap between one
   * section's last row & the next section's head. The sprigs were drawn for this project. To swap
   * in other art, replace the --ledger-sprig URLs; each is a 44 × 16 mask with the stem entering
   * from the left.
   */
  section {
    --ledger-section-gap: 3rem;
    --ledger-head-size: 3rem;
    /* 0: fern */
    --ledger-sprig: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 16'%3E%3Cpath d='M3 8.6 C13 7.4 27 9.4 39 7.9' fill='none' stroke='%23000' stroke-width='0.9' stroke-linecap='round'/%3E%3Cellipse cx='10' cy='6' rx='3.3' ry='1.15' transform='rotate(-32 10 6)'/%3E%3Cellipse cx='13.6' cy='10.7' rx='3.3' ry='1.15' transform='rotate(30 13.6 10.7)'/%3E%3Cellipse cx='19.4' cy='6.3' rx='3' ry='1.1' transform='rotate(-30 19.4 6.3)'/%3E%3Cellipse cx='23.2' cy='10.6' rx='3' ry='1.1' transform='rotate(28 23.2 10.6)'/%3E%3Cellipse cx='28.6' cy='6.5' rx='2.5' ry='1' transform='rotate(-28 28.6 6.5)'/%3E%3Cellipse cx='32.2' cy='10' rx='2.4' ry='1' transform='rotate(26 32.2 10)'/%3E%3Ccircle cx='40.4' cy='7.8' r='1.5'/%3E%3C/svg%3E");

    position: relative;
    scroll-margin-block-start: var(--ledger-anchor-offset, 7rem);
  }

  /* 1: laurel */
  section[data-sprig="1"] {
    --ledger-sprig: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 16'%3E%3Cpath d='M3 8.3 C15 7.7 27 8.5 38 8' fill='none' stroke='%23000' stroke-width='0.9' stroke-linecap='round'/%3E%3Cellipse cx='11' cy='5.5' rx='3.7' ry='1.25' transform='rotate(-24 11 5.5)'/%3E%3Cellipse cx='11' cy='10.9' rx='3.7' ry='1.25' transform='rotate(24 11 10.9)'/%3E%3Cellipse cx='19.5' cy='5.5' rx='3.7' ry='1.25' transform='rotate(-24 19.5 5.5)'/%3E%3Cellipse cx='19.5' cy='10.9' rx='3.7' ry='1.25' transform='rotate(24 19.5 10.9)'/%3E%3Cellipse cx='28' cy='5.7' rx='3.3' ry='1.15' transform='rotate(-22 28 5.7)'/%3E%3Cellipse cx='28' cy='10.6' rx='3.3' ry='1.15' transform='rotate(22 28 10.6)'/%3E%3Cellipse cx='38.6' cy='8' rx='3.4' ry='1.2'/%3E%3C/svg%3E");
  }

  /* 2: berries */
  section[data-sprig="2"] {
    --ledger-sprig: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 16'%3E%3Cpath d='M3 9.2 C12 8.6 22 9.2 30 7.6 M30 7.6 L35.6 4.9 M30 7.6 L37.6 9.2 M30 7.6 L33.2 11.8' fill='none' stroke='%23000' stroke-width='0.85' stroke-linecap='round'/%3E%3Cellipse cx='12.5' cy='6.1' rx='3.9' ry='1.55' transform='rotate(-30 12.5 6.1)'/%3E%3Cellipse cx='20' cy='11.6' rx='3.7' ry='1.45' transform='rotate(28 20 11.6)'/%3E%3Ccircle cx='36.3' cy='4.5' r='1.8'/%3E%3Ccircle cx='38.8' cy='9.4' r='1.8'/%3E%3Ccircle cx='33.4' cy='12.5' r='1.7'/%3E%3C/svg%3E");
  }

  /* 3: wheat */
  section[data-sprig="3"] {
    --ledger-sprig: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 16'%3E%3Cpath d='M3 8.4 C10 8.2 17 8.1 23 8' fill='none' stroke='%23000' stroke-width='0.9' stroke-linecap='round'/%3E%3Cellipse cx='13' cy='10.4' rx='5' ry='0.85' transform='rotate(16 13 10.4)'/%3E%3Cellipse cx='25' cy='6.6' rx='2.5' ry='1.15' transform='rotate(-38 25 6.6)'/%3E%3Cellipse cx='25' cy='9.4' rx='2.5' ry='1.15' transform='rotate(38 25 9.4)'/%3E%3Cellipse cx='29' cy='6.6' rx='2.5' ry='1.15' transform='rotate(-38 29 6.6)'/%3E%3Cellipse cx='29' cy='9.4' rx='2.5' ry='1.15' transform='rotate(38 29 9.4)'/%3E%3Cellipse cx='33' cy='6.7' rx='2.3' ry='1.1' transform='rotate(-38 33 6.7)'/%3E%3Cellipse cx='33' cy='9.3' rx='2.3' ry='1.1' transform='rotate(38 33 9.3)'/%3E%3Cellipse cx='37.6' cy='8' rx='2.4' ry='1.05'/%3E%3Cpath d='M39.5 8 L42.5 6.2 M39.5 8 L42.5 9.8' stroke='%23000' stroke-width='0.5' stroke-linecap='round'/%3E%3C/svg%3E");
  }

  /* 4: clover */
  section[data-sprig="4"] {
    --ledger-sprig: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 16'%3E%3Cpath d='M4 10.2 C12 10.6 21 9.6 30.5 8.4' fill='none' stroke='%23000' stroke-width='0.9' stroke-linecap='round'/%3E%3Cellipse cx='15' cy='8' rx='2.8' ry='1.05' transform='rotate(-26 15 8)'/%3E%3Ccircle cx='32.4' cy='5.3' r='2.4'/%3E%3Ccircle cx='35.6' cy='8.6' r='2.4'/%3E%3Ccircle cx='32.4' cy='11.6' r='2.4'/%3E%3C/svg%3E");
  }

  /* 5: fiddlehead */
  section[data-sprig="5"] {
    --ledger-sprig: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 16'%3E%3Cpath d='M3 9.2 C14 9.6 24 8.6 30 7.2 C35 5.8 39.2 7 38.8 10.1 C38.4 12.8 34.6 12.8 34.1 10.4 C33.8 8.9 35.6 8.3 36.4 9.7' fill='none' stroke='%23000' stroke-width='1' stroke-linecap='round'/%3E%3Cellipse cx='11' cy='7.3' rx='2.2' ry='0.85' transform='rotate(-32 11 7.3)'/%3E%3Cellipse cx='12.4' cy='11.2' rx='2.2' ry='0.85' transform='rotate(30 12.4 11.2)'/%3E%3Cellipse cx='19.6' cy='6.9' rx='2' ry='0.8' transform='rotate(-30 19.6 6.9)'/%3E%3Cellipse cx='21' cy='10.6' rx='2' ry='0.8' transform='rotate(28 21 10.6)'/%3E%3C/svg%3E");
  }

  section[hidden] {
    display: none;
  }

  section[data-divider] {
    margin-block-start: var(--ledger-section-gap);
  }

  section[data-divider]::before,
  section[data-divider]::after {
    position: absolute;
    inset-block-start: calc(var(--ledger-section-gap) / -2);
    inset-inline: 0;
    margin-inline: auto;
    content: "";
    pointer-events: none;
    translate: 0 -50%;
  }

  /* Tapering hairlines, in neutral ink */
  section[data-divider]::before {
    block-size: 12px;
    inline-size: 15rem;
    background: var(--color-rule);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 12'%3E%3Cpath d='M6 6 L94 5.35 L94 6.65 Z M146 5.35 L234 6 L146 6.65 Z'/%3E%3C/svg%3E")
      center / 100% 100% no-repeat;
  }

  /* The sprig: the page's color mixed 62% into the paper, so it reads printed, not inked */
  section[data-divider]::after {
    block-size: 16px;
    inline-size: 44px;
    background: color-mix(in srgb, var(--primary, var(--color-ink-muted)) 62%, var(--color-paper));
    mask: var(--ledger-sprig) center / 100% 100% no-repeat;
  }

  /* Everything's places fold up, so they list as quiet rows rather than chapters. */
  section.collapsible {
    border-block-start: 1px solid var(--color-rule-faint);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.75rem;
    padding-block-end: 0.25rem;
  }

  /*
   * Heads stick under the page header, and in Everything under the group's own sticky head too,
   * so a long place still says which place it is. The column heads stick right under them.
   */
  .head {
    position: sticky;
    z-index: 2;
    top: calc(var(--ledger-sticky-top, 0px) + var(--ledger-group-head, 0px));
    min-block-size: var(--ledger-head-size);
    background: var(--color-paper);
  }

  @media (max-height: 31.25rem) {
    section:not(.collapsible) > .head {
      position: relative;
      top: auto;
    }
  }

  h3 {
    flex: 1 1 auto;
    padding-block: 0.6rem 0.25rem;
    font-family: var(--font-brand);
    font-size: var(--text-xl);
    line-height: 1.2;
  }

  .place h3 {
    font-family: var(--font-body);
  }

  .place .head :global(.head-shelf),
  .place summary[data-shelf-heading] {
    font-family: var(--font-data);
    font-size: var(--text-3xs);
  }

  section:not(.collapsible) h3 {
    flex: 0 1 auto;
  }

  h3:focus-visible,
  h3:focus-visible button > span:first-of-type {
    outline: none;
    text-decoration: underline;
    text-decoration-color: var(--primary);
    text-underline-offset: 0.25em;
  }

  h3 button {
    display: inline-flex;
    min-block-size: 44px;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    text-align: start;
  }

  .jump :global(svg) {
    color: var(--color-ink-muted);
  }

  .sections-jump {
    order: 1;
    min-block-size: 44px;
    margin-inline-start: auto;
    padding-inline: 0.35rem;
    color: var(--color-guide-voice);
    font-family: var(--font-controls);
    font-size: var(--text-xs);
  }

  .section-blank {
    inline-size: 7rem;
    block-size: 1em;
    border-block-end: 1px solid var(--color-ink-muted);
  }

  .subsection > .head {
    position: static;
    min-block-size: 0;
  }

  .subsection > .head h3 {
    color: var(--color-guide-voice);
    font-family: var(--font-body);
    font-size: var(--text-base);
  }

  .subsection .section-progress::before {
    margin-inline-end: 0.45ch;
    content: "·";
  }

  /*
   * A folded section prints like a line of the index: name, dotted leader, & count. Lines stack
   * without sprigs, and an open section before one keeps the usual gap.
   */
  section.line .head {
    position: static;
    min-block-size: 0;
    padding-block-end: 0;
  }

  section.line h3 {
    flex: 1 1 auto;
    padding-block: 0;
    font-size: var(--text-lg);
  }

  :global(section[data-ledger-section]:not(.line, [hidden])) + section.line {
    margin-block-start: var(--ledger-section-gap);
  }

  .line-button {
    display: flex;
    inline-size: 100%;
    flex-wrap: nowrap;
    align-items: last baseline;
    gap: 0.5rem;
  }

  .line-name {
    min-inline-size: 0;
  }

  .line-shelf {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.3rem;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-2xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .leader {
    min-inline-size: 1.5rem;
    flex: 1;
    border-block-end: 1px dotted var(--color-rule);
    translate: 0 -0.3em;
  }

  .line-count {
    flex: none;
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .line-button:hover .line-name {
    text-decoration: underline dotted;
    text-decoration-color: var(--primary);
    text-underline-offset: 0.25em;
  }

  .head :global(.head-shelf) {
    gap: 0.5rem;
  }

  .remaining,
  .section-progress {
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-sm);
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

  /* Only the player's own count is handwritten. */
  .hand {
    color: var(--color-hand-pencil);
    font-family: var(--font-hand);
  }

  .shelves {
    min-inline-size: 0;
  }

  /*
   * Rows don't share a subgrid. Every track is sized the same way for every row instead, so the
   * columns still line up.
   */
  .ledger-table {
    --ledger-row-tracks: auto auto minmax(0, 1fr);
  }

  /* The intrinsic row size plus its rule, matching ledger-row.svelte. */
  .row-window {
    --ledger-row-pixels: 37;
  }

  /*
   * Rows run taller than the estimate, so the browser has to anchor on a real row to keep the
   * reader in place as the window moves. A spacer is never a stable anchor: its height is a guess.
   */
  .row-spacer {
    position: relative;
    overflow-anchor: none;
    block-size: calc(var(--unmounted) * var(--ledger-row-pixels) * 1px);
  }

  .row-page {
    position: absolute;
    inset-inline-start: 0;
    min-block-size: calc(var(--ledger-row-pixels) * 1px);
    padding-inline: 0.5rem;
    color: var(--color-guide-voice);
    font-family: var(--font-controls);
    font-size: var(--text-sm);
    text-decoration: underline dotted;
    text-underline-offset: 0.25em;
  }

  .previous {
    inset-block-end: 0;
  }

  .next {
    inset-block-start: 0;
  }

  @media (any-pointer: coarse), (hover: none) {
    .row-window {
      --ledger-row-pixels: 45;
    }
  }

  /* The checkbox's track, matching the row's own target size (ledger-row.svelte). */
  @media (pointer: fine) and (hover: hover) {
    .ledger-table {
      --ledger-check-size: 32px;
    }
  }

  @media (any-pointer: coarse), (hover: none) {
    .ledger-table {
      --ledger-check-size: 44px;
    }
  }

  .timetable {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
    padding-block: 0.25rem;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-2xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .name-head {
    display: none;
  }

  .timetable .column-head {
    display: inline-flex;
    min-block-size: 44px;
    align-items: center;
    gap: 0.35rem;
    padding-inline: 0.55rem;
    border: 1px solid var(--color-rule);
    border-radius: var(--radius);
    text-align: start;
    text-transform: inherit;
  }

  /* A plain label on narrow screens, so it doesn't pose as a button. */
  .timetable span.column-head {
    border-color: transparent;
  }

  .timetable button.column-head:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }

  .timetable button.column-head:hover span {
    text-decoration: underline dotted;
    text-underline-offset: 0.3em;
  }

  .timetable .column-head[aria-pressed="true"] {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, var(--color-paper));
  }

  @media (min-width: 60rem) {
    .ledger-table {
      --ledger-row-tracks: var(--ledger-tracks);
    }

    .timetable {
      position: sticky;
      z-index: 1;
      /* The head's measured height, since its jump control wraps it to two lines at book widths. */
      top: calc(
        var(--ledger-sticky-top, 0px) + var(--ledger-group-head, 0px) +
          var(--ledger-head-measured, var(--ledger-head-size))
      );
      display: grid;
      column-gap: 0.35rem;
      grid-template-columns: var(--ledger-row-tracks);
      padding-block: 0;
      border-block-end: 1px solid var(--color-ink-hairline);
      background: var(--color-paper);
    }

    .name-head {
      display: block;
      grid-column: 3;
    }

    .timetable .column-head {
      min-block-size: 2rem;
      justify-content: flex-start;
      padding-inline: 0.5rem;
      border: 0;
      border-radius: 0;
    }

    /* The one vertical rule: between the name and the sources it came from. */
    .timetable .column-head.first {
      border-inline-start: 1px solid var(--color-rule-faint);
    }

    .timetable .column-head span {
      min-inline-size: 0;
      overflow-wrap: anywhere;
      hyphens: auto;
    }
  }

  @media (min-width: 60rem) and (max-height: 31.25rem) {
    section:not(.collapsible) .timetable {
      position: static;
    }
  }

  /* The final row hands off to the shelf fold's own dashed rule. */
  section:not([data-ledger-searching])
    .row-window:not([data-has-more])
    > :global(:nth-last-child(1 of [data-ledger-row]:not([hidden]))),
  section[data-ledger-searching]
    .row-window:not([data-has-more])
    > :global(:nth-last-child(1 of [data-ledger-row]:not([hidden], [data-ledger-search-miss]))) {
    border-block-end: 0;
  }

  section[data-ledger-searching] :global([data-ledger-search-miss]) {
    display: none;
  }

  details {
    margin-block-start: 0.5rem;
    border-block-start: 1px dashed var(--color-rule);
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
    color: var(--color-shelf-completed);
  }

  details[open] summary :global(.shelf-chevron) {
    transform: rotate(90deg);
  }

  .shelf-count {
    margin-inline-start: auto;
  }
</style>
