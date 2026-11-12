<script lang="ts">
  import IconClock from "@tabler/icons-svelte-runes/icons/clock";
  import IconFilter from "@tabler/icons-svelte-runes/icons/filter";
  import IconListDetails from "@tabler/icons-svelte-runes/icons/list-details";
  import IconPlugConnected from "@tabler/icons-svelte-runes/icons/plug-connected";
  import IconRotate from "@tabler/icons-svelte-runes/icons/rotate";
  import IconSearch from "@tabler/icons-svelte-runes/icons/search";
  import { flushSync, onDestroy, tick, untrack } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";

  import ThumbIndex from "#lib/components/book/thumb-index.svelte";
  import ClockPanel from "#lib/components/clock-panel.svelte";
  import FeedbackPanel from "#lib/components/feedback-panel.svelte";
  import FilterPanel from "#lib/components/filter-panel.svelte";
  import FoldoutPanel from "#lib/components/foldout-panel.svelte";
  import { Icon } from "#lib/components/icon/index.js";
  import PanelOverlay from "#lib/components/panel-overlay.svelte";
  import QuickSettingsPanel from "#lib/components/quick-settings-panel.svelte";
  import SyncStatusPanel from "#lib/components/sync/sync-status-panel.svelte";
  import { Input } from "#lib/components/ui/input/index.js";
  import { trackingReminders } from "#lib/controllers/tracking-reminders.svelte.js";
  import { getName } from "#lib/data/names.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { deLocalizeHref } from "#lib/paraglide/runtime.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncCourier } from "#lib/sync/courier-state.svelte.js";
  import { syncReceiver } from "#lib/sync/receiver-state.svelte.js";
  import { seasonLabel, weatherLabel } from "#lib/utils/format.js";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";

  import type { PageMetadata } from "#lib/data/page-metadata.js";
  import type { ToolbarPanel } from "#lib/stores/toolbar-state.svelte.js";

  // The root layout resolves `metadata` (including the error-page fallback) and passes it down, so
  // this never reads `page.data.metadata`, which is absent when no `+page.ts` load ran.
  let { metadata }: { metadata: PageMetadata } = $props();

  const feedbackContext = getFeedbackContext();
  // Route matching below is keyed by the unprefixed route, not the locale-prefixed browser URL.
  let pathname = $derived(deLocalizeHref(page.url.pathname));
  let toolbar = $derived(metadata.toolbar === "hidden" ? null : metadata.toolbar);
  let toolbarAccent = $derived(metadata.accent);

  let syncing = $derived(userState.syncLane !== undefined);
  let syncSpeaksUp = $derived(
    syncReceiver.needsALook || syncReceiver.gapDays !== undefined || syncCourier.speaksUp,
  );
  let syncStatusLabel = $derived.by(() => {
    const { trouble, upload } = syncCourier.status;
    if (syncReceiver.status.kind === "unreadable" || trouble === "unreadable") {
      return m.sync_status_unreadable();
    }
    if (
      syncReceiver.needsALook ||
      trouble === "moved" ||
      trouble === "reallow" ||
      upload === "refused" ||
      upload === "update"
    ) {
      return m.sync_status_look();
    }
    if (syncReceiver.gapDays !== undefined) return m.sync_status_late();
    if (syncReceiver.status.kind === "paused" || upload === "paused") return m.sync_status_paused();
    if (syncReceiver.status.kind === "unreachable" || upload === "unreachable") {
      return m.sync_status_offline();
    }
    return m.sync_status_up_to_date();
  });

  let panelElement = $state<HTMLElement | null>(null);
  let panelOpener: HTMLElement | null = null;

  $effect(() => {
    if (feedbackContext.errorReportRequest) {
      untrack(() => {
        panelOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        toolbarState.activePanel = "feedback";
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
      if (toolbar?.filter && toolbarState.activePanel !== "visibility") togglePanel("visibility");
    });
  });

  // Keeps toasts (an Undo, say) from covering the open panel's controls. The fixed panel's
  // `offsetTop` is viewport-relative and ignores its fly-in transform, unlike the bounding box.
  $effect(() => {
    const panel = panelElement;
    if (!panel) return;
    const measure = (): void => {
      toolbarState.panelClearance = Math.max(0, globalThis.innerHeight - panel.offsetTop);
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

  // The book's thumb-tab rail holds Settings & Send a note at wide sizes; it asks for their panels.
  // A request made before this toolbar mounted (a locale switch remounts it) isn't replayed.
  let handledPanelRequest = toolbarState.panelRequest?.serial ?? 0;
  $effect(() => {
    const request = toolbarState.panelRequest;
    if (!request || request.serial <= handledPanelRequest) return;
    handledPanelRequest = request.serial;
    untrack(() => {
      togglePanel(request.panel);
    });
  });
  // The open panel belongs to this toolbar, so it doesn't outlive it.
  onDestroy(() => {
    toolbarState.activePanel = null;
  });

  // Stopping, here or in another tab, leaves the sync panel nothing to say.
  $effect(() => {
    if (!syncing && toolbarState.activePanel === "sync") closePanel(false);
  });

  afterNavigate(({ shallow }) => {
    if (shallow) return;
    closePanel(false);
    feedbackContext.errorReportRequest = undefined;
    clearTimeout(debounceTimer);
    feedbackContext.reset();
  });

  export function isOverlayActive(): boolean {
    return toolbarState.activePanel !== null || feedbackContext.isPicking;
  }

  async function afterTick(run: () => void): Promise<void> {
    await tick();
    run();
  }

  function closePanel(restoreFocus = true): void {
    if (toolbarState.activePanel === null) return;
    toolbarState.activePanel = null;
    const focusTarget = panelOpener;
    panelOpener = null;
    if (restoreFocus) {
      void afterTick(() => {
        if (
          toolbarState.activePanel === null &&
          !toolbarState.searchOpen &&
          focusTarget?.isConnected
        ) {
          focusTarget.focus();
        }
      });
    }
  }

  function togglePanel(panel: ToolbarPanel): void {
    if (toolbarState.activePanel === panel) {
      closePanel();
      return;
    }
    // Moving on from Contents to a panel it lists keeps Contents' opener, since its row unmounts.
    if (toolbarState.activePanel !== "contents") {
      panelOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    toolbarState.activePanel = panel;
    if (panel === "clock") trackingReminders.clearClockHint();
    if (panel !== "feedback") {
      void afterTick(() => {
        if (toolbarState.activePanel === panel) {
          panelElement?.querySelector<HTMLElement>("button, a")?.focus();
        }
      });
    }
  }

  let searchInput = $state<HTMLInputElement | null>(null);
  let searchOpener: HTMLElement | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(debounceTimer));

  function closeSearch(): void {
    clearTimeout(debounceTimer);
    toolbarState.closeSearch();
    const focusTarget = searchOpener;
    searchOpener = null;
    void afterTick(() => {
      const restoredTarget = focusTarget?.isConnected
        ? focusTarget
        : document.querySelector<HTMLElement>("[data-toolbar-search-trigger]");
      restoredTarget?.focus();
    });
  }

  function handleSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      toolbarState.setSearchQuery(target.value);
    }, 200);
  }

  function openSearch(): void {
    closePanel();
    searchOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    toolbarState.openSearch();
    flushSync();
    searchInput?.focus();
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
    filterStatus = filtersActive ? m.toolbar_filters_applied() : m.toolbar_filters_cleared();
  }
</script>

{#if toolbar}
  {#key pathname}
    {#key feedbackContext.errorReportRequest}
      <FeedbackPanel
        accentColor={toolbarAccent}
        initialMessage={feedbackContext.errorReportRequest?.message}
        allowSyncLog={feedbackContext.errorReportRequest === undefined}
        open={toolbarState.activePanel === "feedback"}
        onClose={closePanel}
        pickerEnabled
        restoreFocus={toolbarState.activePanel === null && !toolbarState.searchOpen}
      />
    {/key}
  {/key}

  <nav
    aria-label={m.toolbar_nav_label()}
    class="toolbar pointer-events-none fixed right-0 bottom-safe-offset-3 left-0 z-[var(--z-toolbar)] mx-auto max-w-lg px-3"
    style="--primary: {toolbarAccent}; --ring: {toolbarAccent}"
    hidden={feedbackContext.isPicking}
  >
    {#if toolbarState.searchOpen}
      <div class="search-bar pointer-events-auto flex items-center gap-2 p-1 shadow-lg">
        <div class="relative flex-1">
          <IconSearch
            class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <label class="sr-only" for="tracker-search">{m.toolbar_search_label()}</label>
          <Input
            bind:ref={searchInput}
            class="min-h-11 px-9"
            id="tracker-search"
            placeholder={m.toolbar_search_placeholder()}
            type="text"
            value={toolbarState.searchQuery}
            oninput={handleSearchInput}
          />
          {#if toolbarState.searchQuery}
            <button
              class="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
              type="button"
              aria-label={m.toolbar_clear_search()}
              onclick={() => {
                toolbarState.setSearchQuery("");
              }}>×</button
            >
          {/if}
        </div>
        <button
          class="min-h-11 px-2 font-controls text-xs text-muted-foreground hover:text-foreground"
          type="button"
          onclick={closeSearch}>{getName("ui", "cancel", page.data.locale)}</button
        >
      </div>
    {:else}
      <div class="flex items-end justify-between gap-3">
        <div class="flex items-center gap-1.5">
          <!-- Contents holds the thumb tabs, Send a note, & Settings; at book widths the rail does. -->
          <button
            class="floating-tool floating-tool--phone {toolbarState.activePanel === 'contents'
              ? 'floating-tool--active'
              : ''}"
            type="button"
            aria-label={m.book_contents()}
            aria-expanded={toolbarState.activePanel === "contents"}
            aria-controls="contents-panel"
            onclick={() => {
              togglePanel("contents");
            }}
          >
            <IconListDetails class="size-5" />
          </button>
          {#if syncing}
            <div class="sync-tool">
              {#if syncReceiver.gapDays !== undefined && toolbarState.activePanel !== "sync"}
                <p class="sync-tool__slip">{m.sync_status_gap({ days: syncReceiver.gapDays })}</p>
              {/if}
              <button
                class="floating-tool {toolbarState.activePanel === 'sync'
                  ? 'floating-tool--active'
                  : ''}"
                type="button"
                aria-label={m.sync_status_name({ status: syncStatusLabel })}
                aria-expanded={toolbarState.activePanel === "sync"}
                aria-controls="sync-status-panel"
                onclick={() => {
                  togglePanel("sync");
                }}
              >
                <IconPlugConnected class="size-5" />
                {#if syncSpeaksUp}<span class="sync-tool__dot" aria-hidden="true"></span>{/if}
              </button>
            </div>
          {/if}
        </div>

        <div class="flex items-center gap-1.5">
          {#if toolbar.search}
            <button
              class="floating-tool"
              type="button"
              aria-label={m.toolbar_search()}
              data-toolbar-search-trigger
              onclick={openSearch}
            >
              <IconSearch class="size-5" />
            </button>
          {/if}
          {#if toolbar.filter}
            <button
              class="floating-tool {toolbarState.activePanel === 'visibility'
                ? 'floating-tool--active'
                : filtersActive
                  ? 'floating-tool--filtered'
                  : ''}"
              type="button"
              aria-label={m.toolbar_visibility_filters()}
              aria-expanded={toolbarState.activePanel === "visibility"}
              aria-controls="filter-panel"
              onclick={() => {
                togglePanel("visibility");
              }}
            >
              <IconFilter class="size-5" />
            </button>
          {/if}
          {#if toolbar.clock}
            <button
              class="floating-tool floating-tool--tabbed {toolbarState.activePanel === 'clock'
                ? 'floating-tool--active'
                : ''}"
              type="button"
              aria-label={trackingReminders.clockHint
                ? m.toolbar_clock_hint({
                    season: seasonLabel(userState.state.worldState.season, page.data.locale),
                    weather: weatherLabel(
                      userState.state.worldState.weather,
                      userState.state.worldState.season,
                    ),
                  })
                : m.toolbar_clock({
                    season: seasonLabel(userState.state.worldState.season, page.data.locale),
                    weather: weatherLabel(
                      userState.state.worldState.weather,
                      userState.state.worldState.season,
                    ),
                  })}
              aria-expanded={toolbarState.activePanel === "clock"}
              aria-controls="clock-panel"
              onclick={() => {
                togglePanel("clock");
              }}
            >
              <IconClock class="size-5" />
              {#if trackingReminders.clockHint}
                <span class="clock-tool__dot" data-clock-dot aria-hidden="true"></span>
              {/if}
              <!-- Sits behind the button's edge, at the screen's edge. -->
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
      </div>
    {/if}
  </nav>

  {#if toolbarState.activePanel !== null && toolbarState.activePanel !== "feedback"}
    <PanelOverlay
      bind:element={panelElement}
      animateOut
      closeLabel={m.toolbar_close_panel()}
      onClose={closePanel}
      style="--primary: {toolbarAccent}; --ring: {toolbarAccent}"
    >
      {#if toolbarState.activePanel === "contents"}
        <FoldoutPanel id="contents-panel" title={m.book_contents()} onClose={closePanel}>
          <ThumbIndex />
        </FoldoutPanel>
      {:else if toolbarState.activePanel === "settings"}
        <FoldoutPanel
          id="quick-settings-panel"
          title={m.toolbar_quick_settings()}
          onClose={closePanel}
        >
          <QuickSettingsPanel />
        </FoldoutPanel>
      {:else if toolbarState.activePanel === "clock"}
        <FoldoutPanel id="clock-panel" title={m.toolbar_clock_title()} onClose={closePanel}>
          <ClockPanel />
        </FoldoutPanel>
      {:else if toolbarState.activePanel === "sync"}
        <FoldoutPanel id="sync-status-panel" title={m.sync_card_title()} onClose={closePanel}>
          <SyncStatusPanel />
        </FoldoutPanel>
      {:else}
        <FoldoutPanel id="filter-panel" title={m.toolbar_filters()} onClose={closePanel}>
          {#snippet headerActions()}
            {#if filtersActive}
              <button
                class="text-fg-amber focus-visible:outline-fg-amber flex min-h-11 items-center gap-1.5 px-2 font-controls text-3xs hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-4"
                type="button"
                onclick={resetFilters}
                transition:fade={{ duration: prefersReducedMotion.current ? 0 : 120 }}
              >
                <IconRotate class="size-3.5" />{m.toolbar_reset_filters()}
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

<style>
  /* Stays put, above the page, while a page turns (see app.css). */
  .toolbar {
    view-transition-name: book-toolbar;
  }

  .search-bar,
  .floating-tool {
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 48%, transparent);
    border-radius: var(--radius-md);
    background: var(--color-paper-raised);
  }

  .floating-tool :global(svg) {
    transition: transform 150ms ease-out;
  }

  .floating-tool {
    display: flex;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    color: var(--color-ink-muted);
    box-shadow: var(--shadow-medium);
    pointer-events: auto;
    transition:
      box-shadow 150ms ease-out,
      color 150ms ease-out,
      transform 150ms ease-out;
  }

  .floating-tool--tabbed {
    position: relative;
    margin-right: 20px;
  }

  .clock-tab {
    position: absolute;
    /* Offsets start inside the button's 1px border, so these sit 2px in from its outer edge. */
    top: 1px;
    bottom: 1px;
    left: 100%;
    z-index: -1;
    display: grid;
    width: 20px;
    place-items: center;
    align-content: center;
    gap: 2px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 48%, transparent);
    border-left: 0;
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    background: var(--color-paper-sunken);
    color: var(--color-ink-muted);
  }

  .floating-tool:is(:hover, :focus-visible),
  .floating-tool--active {
    color: var(--primary);
    box-shadow: var(--shadow-large);
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    transform: translateY(-2px);
  }

  .sync-tool {
    position: relative;
    pointer-events: auto;
  }

  .sync-tool__dot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-status-warning);
  }

  /* Top left, away from the season tab on the button's right edge. */
  .clock-tool__dot {
    position: absolute;
    top: 5px;
    left: 5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
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

  .floating-tool--filtered {
    color: var(--color-toolbar-filtered);
    background: color-mix(in srgb, var(--color-paper-raised) 86%, var(--color-toolbar-filtered));
  }

  .floating-tool:is(:hover, :focus-visible) :global(svg) {
    transform: rotate(-7deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .floating-tool,
    .floating-tool :global(svg) {
      transition-duration: 0.01ms;
    }

    .floating-tool:is(:hover, :focus-visible),
    .floating-tool--active,
    .floating-tool:is(:hover, :focus-visible) :global(svg) {
      transform: none;
    }
  }

  /* At book widths (the media query matches the `book` variant in app.css), the page tools sit in
     the header row across the top of the page, under the wire & left of the thumb tabs, and scroll
     away with it. The page's padding reserves the row. */
  @media (min-width: 48rem) and (min-height: 32rem) {
    .floating-tool--phone {
      display: none;
    }

    .toolbar {
      position: absolute;
      top: calc(var(--size-book-margin) + 0.75rem);
      right: calc(var(--size-book-rail-width) + 1.25rem);
      bottom: auto;
      left: calc(var(--size-book-margin) + var(--size-book-wire-width) + 1.25rem);
      max-width: none;
    }

    .floating-tool {
      box-shadow: none;
    }

    .sync-tool__slip {
      top: calc(100% + 8px);
      bottom: auto;
    }
  }
</style>
