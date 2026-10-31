<script lang="ts">
  import IconFilter from "@tabler/icons-svelte-runes/icons/filter";
  import IconMessageReport from "@tabler/icons-svelte-runes/icons/message-report";
  import IconPlugConnected from "@tabler/icons-svelte-runes/icons/plug-connected";
  import IconRotate from "@tabler/icons-svelte-runes/icons/rotate";
  import IconSearch from "@tabler/icons-svelte-runes/icons/search";
  import IconSettings from "@tabler/icons-svelte-runes/icons/settings";
  import { flushSync, onDestroy, tick } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";

  import FeedbackPanel from "#lib/components/feedback-panel.svelte";
  import FilterPanel from "#lib/components/filter-panel.svelte";
  import FoldoutPanel from "#lib/components/foldout-panel.svelte";
  import PanelOverlay from "#lib/components/panel-overlay.svelte";
  import QuickSettingsPanel from "#lib/components/quick-settings-panel.svelte";
  import SyncStatusPanel from "#lib/components/sync/sync-status-panel.svelte";
  import { Input } from "#lib/components/ui/input/index.js";
  import { getName } from "#lib/data/names.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { deLocalizeHref } from "#lib/paraglide/runtime.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncEnabled } from "#lib/sync/enabled.js";
  import { syncReceiver } from "#lib/sync/receiver-state.svelte.js";
  import { DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";

  import type { PageMetadata } from "#lib/data/page-metadata.js";

  type ActivePanel = "feedback" | "settings" | "sync" | "visibility" | null;

  // The root layout resolves `metadata` (including the error-page fallback) and passes it down, so
  // this never reads `page.data.metadata`, which is absent when no `+page.ts` load ran.
  let { metadata }: { metadata: PageMetadata } = $props();

  const feedbackContext = getFeedbackContext();
  // Route matching below is keyed by the unprefixed route, not the locale-prefixed browser URL.
  let pathname = $derived(deLocalizeHref(page.url.pathname));
  let toolbar = $derived(metadata.toolbar === "hidden" ? null : metadata.toolbar);
  let toolbarAccent = $derived(metadata.accent);

  let syncing = $derived(syncEnabled && userState.syncLane !== undefined);
  let syncSpeaksUp = $derived(syncReceiver.needsALook || syncReceiver.gapDays !== undefined);
  let syncStatusLabel = $derived.by(() => {
    if (syncReceiver.status.kind === "unreadable") return m.sync_status_unreadable();
    if (syncReceiver.needsALook) return m.sync_status_look();
    if (syncReceiver.gapDays !== undefined) return m.sync_status_late();
    if (syncReceiver.status.kind === "paused") return m.sync_status_paused();
    if (syncReceiver.status.kind === "unreachable") return m.sync_status_offline();
    return m.sync_status_up_to_date();
  });

  let activePanel = $state<ActivePanel>(null);
  let panelElement = $state<HTMLElement | null>(null);
  let panelOpener: HTMLElement | null = null;

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

  // Stopping, here or in another tab, leaves the sync panel nothing to say.
  $effect(() => {
    if (!syncing && activePanel === "sync") closePanel(false);
  });

  afterNavigate(({ shallow }) => {
    if (shallow) return;
    closePanel(false);
    clearTimeout(debounceTimer);
    feedbackContext.reset();
  });

  export function isOverlayActive(): boolean {
    return activePanel !== null || feedbackContext.isPicking;
  }

  async function afterTick(run: () => void): Promise<void> {
    await tick();
    run();
  }

  function closePanel(restoreFocus = true): void {
    if (activePanel === null) return;
    activePanel = null;
    const focusTarget = panelOpener;
    panelOpener = null;
    if (restoreFocus) {
      void afterTick(() => {
        if (activePanel === null && !toolbarState.searchOpen && focusTarget?.isConnected) {
          focusTarget.focus();
        }
      });
    }
  }

  function togglePanel(panel: Exclude<ActivePanel, null>): void {
    if (activePanel === panel) {
      closePanel();
      return;
    }
    panelOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activePanel = panel;
    if (panel !== "feedback") {
      void afterTick(() => {
        if (activePanel === panel) panelElement?.querySelector<HTMLElement>("button, a")?.focus();
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

  let availabilityIsDefault = $derived(
    userState.state.availabilityWindows.length === DEFAULT_AVAILABILITY_WINDOWS.length &&
      DEFAULT_AVAILABILITY_WINDOWS.every(
        (window, index) => userState.state.availabilityWindows[index] === window,
      ),
  );
  let filtersActive = $derived(
    !availabilityIsDefault ||
      userState.state.showCompleted ||
      toolbarState.isSourceFilterNarrowing ||
      (toolbarState.hasAlmanacFilters && toolbarState.showUnobtainable),
  );

  function resetFilters(): void {
    userState.setAvailabilityWindows(DEFAULT_AVAILABILITY_WINDOWS);
    if (userState.state.showCompleted) userState.toggleShowCompleted();
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
    <FeedbackPanel
      accentColor={toolbarAccent}
      open={activePanel === "feedback"}
      onClose={closePanel}
      pickerEnabled
      restoreFocus={activePanel === null && !toolbarState.searchOpen}
    />
  {/key}

  <nav
    aria-label={m.toolbar_nav_label()}
    class="pointer-events-none fixed right-0 bottom-safe-offset-3 left-0 z-[var(--z-toolbar)] mx-auto max-w-lg px-3"
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
          <button
            class="floating-tool {activePanel === 'settings' ? 'floating-tool--active' : ''}"
            type="button"
            aria-label={m.toolbar_quick_settings()}
            aria-expanded={activePanel === "settings"}
            aria-controls="quick-settings-panel"
            onclick={() => {
              togglePanel("settings");
            }}
          >
            <IconSettings class="size-5 transition-transform motion-reduce:transition-none" />
          </button>
          <button
            class="floating-tool {activePanel === 'feedback' ? 'floating-tool--active' : ''}"
            type="button"
            aria-label={m.toolbar_send_feedback()}
            aria-expanded={activePanel === "feedback"}
            onclick={() => {
              togglePanel("feedback");
            }}
          >
            <IconMessageReport class="size-5" />
          </button>
          {#if syncing}
            <div class="sync-tool">
              {#if syncReceiver.gapDays !== undefined && activePanel !== "sync"}
                <p class="sync-tool__slip">{m.sync_status_gap({ days: syncReceiver.gapDays })}</p>
              {/if}
              <button
                class="floating-tool {activePanel === 'sync' ? 'floating-tool--active' : ''}"
                type="button"
                aria-label={m.sync_status_name({ status: syncStatusLabel })}
                aria-expanded={activePanel === "sync"}
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
          <button
            class="floating-tool {activePanel === 'visibility'
              ? 'floating-tool--active'
              : filtersActive
                ? 'floating-tool--filtered'
                : ''}"
            type="button"
            aria-label={m.toolbar_visibility_filters()}
            aria-expanded={activePanel === "visibility"}
            aria-controls="filter-panel"
            onclick={() => {
              togglePanel("visibility");
            }}
          >
            <IconFilter class="size-5" />
          </button>
        </div>
      </div>
    {/if}
  </nav>

  {#if activePanel === "settings" || activePanel === "visibility" || activePanel === "sync"}
    <PanelOverlay
      bind:element={panelElement}
      animateOut
      closeLabel={m.toolbar_close_panel()}
      onClose={closePanel}
      style="--primary: {toolbarAccent}; --ring: {toolbarAccent}"
    >
      {#if activePanel === "settings"}
        <FoldoutPanel
          id="quick-settings-panel"
          title={m.toolbar_quick_settings()}
          onClose={closePanel}
        >
          <QuickSettingsPanel />
        </FoldoutPanel>
      {:else if activePanel === "sync"}
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
          <FilterPanel
            showWorldStateFilters={toolbar.worldState}
            onFilterChange={announceFilters}
          />
        </FoldoutPanel>
      {/if}
    </PanelOverlay>
  {/if}

  <p class="sr-only" role="status" aria-live="polite">{filterStatus}</p>
{/if}

<style>
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
</style>
