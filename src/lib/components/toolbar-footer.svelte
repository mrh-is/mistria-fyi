<script lang="ts">
  import IconClock from "@tabler/icons-svelte-runes/icons/clock";
  import IconFilter from "@tabler/icons-svelte-runes/icons/filter";
  import IconListDetails from "@tabler/icons-svelte-runes/icons/list-details";
  import IconPlugConnected from "@tabler/icons-svelte-runes/icons/plug-connected";
  import IconRotate from "@tabler/icons-svelte-runes/icons/rotate";
  import IconSearch from "@tabler/icons-svelte-runes/icons/search";
  import { onDestroy, untrack } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { MediaQuery } from "svelte/reactivity";
  import { fade } from "svelte/transition";

  import { getBookPanels } from "#lib/components/book/book-panels.svelte.js";
  import ThumbIndex from "#lib/components/book/thumb-index.svelte";
  import ClockPanel from "#lib/components/clock-panel.svelte";
  import FeedbackPanel from "#lib/components/feedback-panel.svelte";
  import FilterPanel from "#lib/components/filter-panel.svelte";
  import FoldoutPanel from "#lib/components/foldout-panel.svelte";
  import { Icon } from "#lib/components/icon/index.js";
  import PanelOverlay from "#lib/components/panel-overlay.svelte";
  import QuickSettingsPanel from "#lib/components/quick-settings-panel.svelte";
  import SyncStatusPanel from "#lib/components/sync/sync-status-panel.svelte";
  import { trackingReminders } from "#lib/controllers/tracking-reminders.svelte.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import { stripLocale } from "#lib/i18n/locale-path.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncCourier } from "#lib/sync/courier-state.svelte.js";
  import { syncReceiver } from "#lib/sync/receiver-state.svelte.js";
  import { seasonLabel, weatherLabel } from "#lib/utils/format.js";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";

  import type { PageMetadata } from "#lib/data/page-metadata.js";

  // The root layout resolves `metadata` (including the error-page fallback) and passes it down, so
  // this never reads `page.data.metadata`, which is absent when no `+page.ts` load ran.
  let { metadata }: { metadata: PageMetadata } = $props();

  const feedbackContext = getFeedbackContext();
  const panels = getBookPanels();
  // Route matching below is keyed by the unprefixed route, not the locale-prefixed browser URL.
  let pathname = $derived(stripLocale(page.url.pathname));
  let searchPlaceholder = $derived.by(() => {
    switch (pathname) {
      case "/":
        return "Search the field guide";
      case "/almanac":
        return "Search the almanac";
      case "/animals":
        return "Search animals";
      case "/cosmetics":
        return "Search cosmetics";
      case "/everything":
        return "Search everything";
      case "/mines":
        return "Search the mines";
      case "/museum":
        return "Search the museum";
      case "/quests":
        return "Search quests";
      case "/recipes":
        return "Search recipes";
      case "/renown":
        return "Search renown";
      case "/skills":
        return "Search skills";
      case "/villagers":
        return "Search villagers";
      default:
        return "Search items";
    }
  });
  let toolbar = $derived(metadata.toolbar === "hidden" ? null : metadata.toolbar);
  let toolbarAccent = $derived(metadata.accent);

  let syncing = $derived(userState.syncLane !== undefined);
  let syncSpeaksUp = $derived(
    syncReceiver.needsALook || syncReceiver.gapDays !== undefined || syncCourier.speaksUp,
  );
  let syncStatusLabel = $derived.by(() => {
    const { trouble, upload } = syncCourier.status;
    if (syncReceiver.status.kind === "unreadable" || trouble === "unreadable") {
      return /* @wc-include */ "can’t read the save file";
    }
    if (
      syncReceiver.needsALook ||
      trouble === "moved" ||
      trouble === "reallow" ||
      upload === "refused" ||
      upload === "update"
    ) {
      return /* @wc-include */ "needs a look";
    }
    if (syncReceiver.gapDays !== undefined) return /* @wc-include */ "no new saves in a while";
    if (syncReceiver.status.kind === "paused" || upload === "paused") {
      return /* @wc-include */ "paused";
    }
    if (syncReceiver.status.kind === "unreachable" || upload === "unreachable") {
      return /* @wc-include */ "can’t connect";
    }
    return /* @wc-include */ "up to date";
  });

  let panelElement = $state<HTMLElement | null>(null);

  // At book widths a panel opens from the control that opened it, not from the screen's foot.
  const bookWidth = new MediaQuery("(min-width: 48rem) and (min-height: 34rem)", false);
  let viewportTick = $state(0);
  let panelAnchor = $derived.by(() => {
    void viewportTick;
    const opener = panels.active === null ? null : panels.opener;
    if (!bookWidth.current || !opener?.isConnected) return "";
    const rect = opener.getBoundingClientRect();
    const right = Math.max(8, globalThis.innerWidth - rect.right);
    const below = rect.top < globalThis.innerHeight / 2;
    const vertical = below
      ? /* @wc-ignore */ `top: ${rect.bottom + 8}px; bottom: auto;`
      : /* @wc-ignore */ `top: auto; bottom: ${globalThis.innerHeight - rect.top + 8}px;`;
    return /* @wc-ignore */ `${vertical} left: auto; right: ${right}px; inline-size: min(24rem, calc(100vw - 1rem)); max-inline-size: none; margin: 0; padding: 0;`;
  });

  /** Room for two stacked toasts & their margins, in pixels. */
  const TOAST_STACK_ROOM = 160;

  /** Whether an open panel hangs from the header row, clear of the toasts at the screen's foot. */
  function panelFromHeader(panel: HTMLElement): boolean {
    return bookWidth.current && panel.offsetTop < globalThis.innerHeight / 2;
  }

  function focusedElement(): HTMLElement | null {
    return document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  // An error boundary asked to report what broke; the control it was on is the trigger.
  $effect(() => {
    if (feedbackContext.errorReportRequest) {
      untrack(() => {
        panels.open("feedback", focusedElement());
      });
    }
  });

  $effect(() => {
    toolbarState.filterPanelAvailable = Boolean(toolbar?.filter);
    return () => {
      toolbarState.filterPanelAvailable = false;
    };
  });

  // Another component, like the empty-state link, asked for the filter panel.
  $effect(() => {
    if (toolbarState.filterPanelRequest === 0) return;
    untrack(() => {
      if (toolbar?.filter && panels.active !== "visibility") {
        panels.open("visibility", focusedElement());
      }
    });
  });

  // Keeps toasts (an Undo, say) from covering the open panel's controls. The fixed panel's
  // `offsetTop` is viewport-relative and ignores its fly-in transform, unlike the bounding box.
  // Toasts stay at the foot instead when a panel opens down from the header at book widths, which
  // leaves the foot free (F22), or when a panel leaves too little room above it for a stack of two
  // toasts, as Contents does on a landscape phone: there they'd climb off the screen (F32).
  $effect(() => {
    const panel = panelElement;
    if (!panel) return;
    const measure = (): void => {
      const clearance = Math.max(0, globalThis.innerHeight - panel.offsetTop);
      toolbarState.panelClearance =
        panelFromHeader(panel) || clearance > globalThis.innerHeight - TOAST_STACK_ROOM
          ? 0
          : clearance;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    globalThis.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", measure);
      toolbarState.panelClearance = 0;
    };
  });

  // Stopping, here or in another tab, leaves the sync panel nothing to say.
  $effect(() => {
    if (!syncing && panels.active === "sync") panels.close(false);
  });

  afterNavigate(({ shallow }) => {
    if (shallow) return;
    panels.close(false);
    feedbackContext.errorReportRequest = undefined;
    clearTimeout(debounceTimer);
    feedbackContext.reset();
  });

  function closePanel(): void {
    panels.close();
  }

  // An opened panel, from here or the rail, focuses its first control; the feedback form focuses
  // itself. Opening the clock clears its hint.
  $effect(() => {
    const panel = panels.active;
    const element = panelElement;
    if (panel === null || panel === "feedback" || !element) return;
    untrack(() => {
      if (panel === "clock") trackingReminders.clearClockHint();
      element.querySelector<HTMLElement>("button, a")?.focus();
    });
  });

  let searchInput = $state<HTMLInputElement | null>(null);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(debounceTimer));

  function handleSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      toolbarState.setSearchQuery(target.value);
    }, 200);
  }

  // The field is always there; focusing it is what opens a search (Home lifts its layout for it).
  function focusSearch(): void {
    panels.close(false);
    toolbarState.openSearch();
  }

  function blurSearch(): void {
    if (!toolbarState.searchQuery) toolbarState.searchOpen = false;
  }

  function clearSearch(): void {
    clearTimeout(debounceTimer);
    toolbarState.setSearchQuery("");
    if (searchInput) searchInput.value = "";
  }

  function handleSearchKey(event: KeyboardEvent): void {
    if (event.key !== /* @wc-ignore */ "Escape") return;
    const hadQuery = Boolean(searchInput?.value);
    clearSearch();
    if (!hadQuery) searchInput?.blur();
  }

  let filtersActive = $derived(
    toolbarState.isSourceFilterNarrowing ||
      (toolbarState.hasAlmanacFilters && toolbarState.showUnobtainable),
  );

  function resetFilters(): void {
    toolbarState.resetSourceFilters();
    toolbarState.showUnobtainable = false;
    announceFilters();
  }
  let filterStatus = $state("");
  function announceFilters(): void {
    filterStatus = filtersActive ? "Filters applied" : "All filters cleared";
  }
</script>

{#if toolbar}
  {#key pathname}
    {#key feedbackContext.errorReportRequest}
      <FeedbackPanel
        accentColor={toolbarAccent}
        initialMessage={feedbackContext.errorReportRequest?.message}
        allowSyncLog={feedbackContext.errorReportRequest === undefined}
        open={panels.active === "feedback"}
        onClose={closePanel}
        pickerEnabled
        restoreFocus={false}
      />
    {/key}
  {/key}

  <nav
    aria-label="Field guide tools"
    class="toolbar fixed right-0 bottom-0 left-0 z-[var(--z-toolbar)]"
    style="--primary: {toolbarAccent}; --ring: {toolbarAccent}"
    hidden={feedbackContext.isPicking}
  >
    <div class="toolbar__row">
      <!-- Contents holds the thumb tabs, Send a note, & Settings; at book widths the rail does. -->
      <button
        class="floating-tool floating-tool--phone {panels.active === 'contents'
          ? 'floating-tool--active'
          : ''}"
        type="button"
        aria-label="Contents"
        aria-expanded={panels.active === "contents"}
        aria-controls="contents-panel"
        data-panel-entry="contents feedback settings"
        onclick={(event) => {
          panels.toggle("contents", event.currentTarget);
        }}
      >
        <IconListDetails class="size-5" />
      </button>
      {#if syncing}
        <div class="sync-tool">
          {#if syncReceiver.gapDays !== undefined && panels.active !== "sync"}
            <p class="sync-tool__slip">
              {`Haven’t heard from your game in ${syncReceiver.gapDays} days`}
            </p>
          {/if}
          <button
            class="floating-tool {panels.active === 'sync' ? 'floating-tool--active' : ''}"
            type="button"
            aria-label={`Save file sync: ${syncStatusLabel}`}
            aria-expanded={panels.active === "sync"}
            aria-controls="sync-status-panel"
            onclick={(event) => {
              panels.toggle("sync", event.currentTarget);
            }}
          >
            <IconPlugConnected class="size-5" />
            {#if syncSpeaksUp}<span class="sync-tool__dot" aria-hidden="true"></span>{/if}
          </button>
        </div>
      {/if}

      {#if toolbar.search}
        <div class="search-field" data-toolbar-search>
          <IconSearch class="search-field__icon size-4" />
          <label class="sr-only" for="tracker-search">Search items</label>
          <input
            bind:this={searchInput}
            class="search-field__input"
            id="tracker-search"
            placeholder={searchPlaceholder}
            type="text"
            enterkeyhint="search"
            autocomplete="off"
            value={toolbarState.searchQuery}
            oninput={handleSearchInput}
            onfocus={focusSearch}
            onblur={blurSearch}
            onkeydown={handleSearchKey}
          />
          {#if toolbarState.searchQuery}
            <button
              class="search-field__clear"
              type="button"
              aria-label="Clear search"
              onclick={clearSearch}>×</button
            >
          {/if}
        </div>
      {:else}
        <span class="toolbar__spacer"></span>
      {/if}

      {#if toolbar.filter}
        <button
          class="floating-tool {panels.active === 'visibility'
            ? 'floating-tool--active'
            : filtersActive
              ? 'floating-tool--filtered'
              : ''}"
          type="button"
          aria-label="Visibility filters"
          aria-expanded={panels.active === "visibility"}
          aria-controls="filter-panel"
          onclick={(event) => {
            panels.toggle("visibility", event.currentTarget);
          }}
        >
          <IconFilter class="size-5" />
          {#if filtersActive}<span class="filter-tool__dot" aria-hidden="true"></span>{/if}
        </button>
      {/if}
      {#if toolbar.clock}
        <button
          class="floating-tool floating-tool--clock {panels.active === 'clock'
            ? 'floating-tool--active'
            : ''}"
          type="button"
          aria-label={trackingReminders.clockHint
            ? `Season & weather: ${seasonLabel(userState.state.worldState.season, page.data.locale)}, ${weatherLabel(
                userState.state.worldState.weather,
                userState.state.worldState.season,
              )}. This sorts your lists; set today’s day.`
            : `Season & weather: ${seasonLabel(userState.state.worldState.season, page.data.locale)}, ${weatherLabel(
                userState.state.worldState.weather,
                userState.state.worldState.season,
              )}`}
          aria-expanded={panels.active === "clock"}
          aria-controls="clock-panel"
          onclick={(event) => {
            panels.toggle("clock", event.currentTarget);
          }}
        >
          <IconClock class="size-5" />
          {#if trackingReminders.clockHint}
            <span class="clock-tool__dot" data-clock-dot aria-hidden="true"></span>
          {/if}
          <!-- Today's season & weather, printed small inside the button after a hairline (F36). -->
          <span class="clock-tab" data-clock-tab aria-hidden="true">
            <Icon.Season season={userState.state.worldState.season} class="size-3" />
            <Icon.Weather
              season={userState.state.worldState.season}
              weather={userState.state.worldState.weather}
              class="size-3"
            />
          </span>
        </button>
      {/if}
    </div>
  </nav>

  {#if panels.active !== null && panels.active !== "feedback"}
    <PanelOverlay
      bind:element={panelElement}
      animateOut
      closeLabel="Close panel"
      onClose={closePanel}
      style="--primary: {toolbarAccent}; --ring: {toolbarAccent}; {panelAnchor}"
    >
      {#if panels.active === "contents"}
        <FoldoutPanel id="contents-panel" title="Contents" onClose={closePanel}>
          <ThumbIndex />
        </FoldoutPanel>
      {:else if panels.active === "settings"}
        <FoldoutPanel id="quick-settings-panel" title="Quick settings" onClose={closePanel}>
          <QuickSettingsPanel />
        </FoldoutPanel>
      {:else if panels.active === "clock"}
        <FoldoutPanel id="clock-panel" title="Season & weather" onClose={closePanel}>
          <ClockPanel />
        </FoldoutPanel>
      {:else if panels.active === "sync"}
        <FoldoutPanel id="sync-status-panel" title="Save file sync" onClose={closePanel}>
          <SyncStatusPanel />
        </FoldoutPanel>
      {:else}
        <FoldoutPanel id="filter-panel" title="Filters" onClose={closePanel}>
          {#snippet headerActions()}
            {#if filtersActive}
              <button
                class="text-fg-amber focus-visible:outline-fg-amber flex min-h-11 items-center gap-1.5 px-2 font-controls text-3xs hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-4"
                type="button"
                onclick={resetFilters}
                transition:fade={{ duration: prefersReducedMotion.current ? 0 : 120 }}
              >
                <IconRotate class="size-3.5" /><!-- @wc-context: toolbar reset filters -->Reset
              </button>
            {/if}
          {/snippet}
          <FilterPanel onFilterChange={announceFilters} />
        </FoldoutPanel>
      {/if}
    </PanelOverlay>
  {/if}

  <p class="sr-only" role="status" aria-live="polite">{filterStatus}</p>
{/if}

<svelte:window onresize={() => (viewportTick += 1)} />

<style>
  /* At book widths the tools turn with the page. On phones the strip stays put. */
  .toolbar {
    view-transition-name: book-toolbar;
  }

  /*
   * On phones the tools sit on a strip of the page header's paper along the screen's foot, running
   * under the home indicator. It's the same stock as the header & the panels the tools open, so a
   * panel reads as coming out of the strip. The cloth belongs to the cover, behind the book.
   */
  .toolbar {
    padding: 0.5rem 0.75rem max(0.5rem, env(safe-area-inset-bottom));
    border-block-start: 1px solid var(--color-rule);
    background: var(--color-paper-raised);
    box-shadow: var(--shadow-small);
    color: var(--color-ink-muted);
  }

  /* A short window pins more at once, so the strip keeps only its buttons' own height (F5). */
  @media (max-height: 31.25rem) {
    .toolbar {
      padding-block: 0.25rem max(0.25rem, env(safe-area-inset-bottom));
    }
  }

  .toolbar__row {
    display: flex;
    max-inline-size: 32rem;
    align-items: center;
    gap: 0.375rem;
    margin-inline: auto;
  }

  .toolbar__spacer {
    flex: 1;
  }

  /* The field is a ruled line to write on, not a box. */
  .search-field {
    position: relative;
    display: flex;
    min-inline-size: 0;
    flex: 1;
    align-items: center;
  }

  .search-field :global(.search-field__icon) {
    position: absolute;
    inset-inline-start: 0.25rem;
    color: var(--color-ink-muted);
    pointer-events: none;
  }

  .search-field__input {
    min-inline-size: 0;
    min-block-size: 44px;
    flex: 1;
    padding-inline: 1.75rem 0.25rem;
    border: 0;
    border-block-end: 1px solid var(--color-ink-hairline);
    border-radius: 0;
    background: none;
    color: var(--color-ink);
    font-family: var(--font-body);
    font-style: italic;
  }

  .search-field__input::placeholder {
    color: var(--color-ink-muted);
  }

  .search-field:has(.search-field__clear) .search-field__input {
    padding-inline-end: 2.5rem;
  }

  .search-field__input:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  .search-field__clear {
    position: absolute;
    inset-inline-end: 0;
    display: grid;
    inline-size: 44px;
    block-size: 44px;
    place-items: center;
    color: var(--color-ink-muted);
  }

  .search-field__clear:hover {
    color: var(--color-ink);
  }

  .floating-tool :global(svg) {
    transition: transform 150ms ease-out;
  }

  .floating-tool {
    position: relative;
    display: flex;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 48%, transparent);
    border-radius: var(--radius-md);
    background: var(--color-paper-raised);
    color: var(--color-ink-muted);
    transition:
      border-color 150ms ease-out,
      color 150ms ease-out;
  }

  .floating-tool--clock {
    gap: 0.375rem;
    padding-inline: 0.5rem 0.375rem;
  }

  .clock-tab {
    display: grid;
    align-self: stretch;
    place-items: center;
    align-content: center;
    gap: 2px;
    padding-inline-start: 0.375rem;
    border-inline-start: 1px solid color-mix(in srgb, var(--color-ink-hairline) 48%, transparent);
    margin-block: 0.5rem;
  }

  .floating-tool:is(:hover, :focus-visible),
  .floating-tool--active {
    border-color: var(--primary);
    color: var(--primary);
    outline: none;
  }

  .floating-tool:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .sync-tool {
    position: relative;
  }

  .sync-tool__dot,
  .clock-tool__dot,
  .filter-tool__dot {
    position: absolute;
    top: 5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .sync-tool__dot {
    right: 5px;
    background: var(--color-status-warning);
  }

  /* Top left, away from the season tab on the button's right edge. */
  .clock-tool__dot {
    left: 5px;
    background: var(--primary);
  }

  /* Filters that hide something take the page's color, with a dot, like the sync tool's. */
  .floating-tool--filtered {
    color: var(--primary);
  }

  .filter-tool__dot {
    right: 5px;
    background: var(--primary);
  }

  .sync-tool__slip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    width: max-content;
    max-width: min(240px, 60vw);
    padding: 4px 9px;
    border: 1px solid color-mix(in srgb, var(--color-status-warning) 50%, transparent);
    background: var(--color-paper-raised);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    line-height: 1.3;
    box-shadow: var(--shadow-medium);
    pointer-events: none;
    transform: translateX(-50%) rotate(-1deg);
  }

  .floating-tool:is(:hover, :focus-visible) :global(svg) {
    transform: rotate(-7deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .floating-tool,
    .floating-tool :global(svg) {
      transition-duration: 0.01ms;
    }

    .floating-tool:is(:hover, :focus-visible) :global(svg) {
      transform: none;
    }
  }

  /* At book widths (the media query matches the `book` variant in app.css), the page tools sit in
     the page header's row, so the strip itself disappears into the header's paper. */
  @media (min-width: 48rem) and (min-height: 34rem) {
    .floating-tool--phone {
      display: none;
    }

    .toolbar {
      position: relative;
      inset: auto;
      padding: 0;
      border: 0;
      background: none;
      box-shadow: none;
    }

    .toolbar__row {
      max-inline-size: none;
      justify-content: flex-end;
    }

    .search-field {
      max-inline-size: 22rem;
    }

    .sync-tool__slip {
      top: calc(100% + 8px);
      bottom: auto;
    }
  }
</style>
