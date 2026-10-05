<script lang="ts">
  import IconFilter from "@tabler/icons-svelte-runes/icons/filter";
  import IconMessageReport from "@tabler/icons-svelte-runes/icons/message-report";
  import IconRotate from "@tabler/icons-svelte-runes/icons/rotate";
  import IconSearch from "@tabler/icons-svelte-runes/icons/search";
  import IconSettings from "@tabler/icons-svelte-runes/icons/settings";
  import { flushSync, tick } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { fade, fly } from "svelte/transition";

  import FeedbackPanel from "#lib/components/feedback-panel.svelte";
  import FoldoutPanel from "#lib/components/foldout-panel.svelte";
  import QuickSettingsPanel from "#lib/components/quick-settings-panel.svelte";
  import { Input } from "#lib/components/ui/input/index.js";
  import VisibilityPanel from "#lib/components/visibility-panel.svelte";
  import { getName } from "#lib/data/names.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { deLocalizeHref } from "#lib/paraglide/runtime.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
  import { page } from "$app/state";

  import type { PageMetadata } from "#lib/data/page-metadata.js";

  type ActivePanel = "feedback" | "settings" | "visibility" | null;

  // The root layout resolves `metadata` (including the error-page fallback) and passes it down, so
  // this never reads `page.data.metadata`, which is absent when no `+page.ts` load ran.
  let {
    metadata,
    overlayActive = $bindable(false),
  }: {
    metadata: PageMetadata;
    overlayActive?: boolean;
  } = $props();

  const feedbackContext = getFeedbackContext();
  // Route matching below is keyed by the unprefixed route, not the locale-prefixed browser URL.
  let pathname = $derived(deLocalizeHref(page.url.pathname));
  let toolbar = $derived(metadata.toolbar === "hidden" ? null : metadata.toolbar);
  let toolbarAccent = $derived(`var(--${metadata.accent})`);

  let activePanel = $state<ActivePanel>(null);
  let previousPathname = $state("");
  let previousPanel = $state<ActivePanel>(null);
  let panelElement = $state<HTMLElement | null>(null);
  let panelOpener: HTMLElement | null = null;

  $effect(() => {
    const currentPathname = pathname;
    if (previousPathname && currentPathname !== previousPathname) activePanel = null;
    previousPathname = currentPathname;
  });

  async function afterTick(run: () => void): Promise<void> {
    await tick();
    run();
  }

  $effect(() => {
    if (activePanel !== null && activePanel !== "feedback" && activePanel !== previousPanel) {
      void afterTick(() => panelElement?.querySelector<HTMLElement>("button, a")?.focus());
    } else if (activePanel === null && previousPanel !== null) {
      const focusTarget = panelOpener;
      panelOpener = null;
      void afterTick(() => {
        if (focusTarget?.isConnected) focusTarget.focus();
      });
    }
    previousPanel = activePanel;
  });

  function closePanel(): void {
    activePanel = null;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (activePanel === null || activePanel === "feedback" || event.key !== "Escape") return;
    event.preventDefault();
    closePanel();
  }

  function togglePanel(panel: Exclude<ActivePanel, null>): void {
    if (activePanel !== panel) {
      panelOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    activePanel = activePanel === panel ? null : panel;
  }

  let searchInput = $state<HTMLInputElement | null>(null);
  let searchOpener: HTMLElement | null = null;
  let debounceTimer: ReturnType<typeof setTimeout>;

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
      toolbarState.setSearch(target.value);
    }, 200);
  }

  function openSearch(): void {
    closePanel();
    searchOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    toolbarState.openSearch();
    flushSync();
    searchInput?.focus();
  }

  $effect(() => {
    overlayActive = activePanel !== null || feedbackContext.isPicking;
  });

  let availabilityIsDefault = $derived(
    userState.state.availabilityWindows.length === 2 &&
      userState.state.availabilityWindows[0] === "now" &&
      userState.state.availabilityWindows[1] === "anytime",
  );
  let filtersActive = $derived(
    !availabilityIsDefault || userState.state.showCompleted || toolbarState.sourceFilterActive,
  );

  function resetFilters(): void {
    userState.setAvailabilityWindows(DEFAULT_AVAILABILITY_WINDOWS);
    if (userState.state.showCompleted) userState.toggleShowCompleted();
    toolbarState.resetSourceFilters();
  }
  let filterStatus = $state("");
  let previousFilterState = $state("");

  $effect(() => {
    const currentFilterState = `${userState.state.availabilityWindows.join(",")}:${userState.state.showCompleted}:${toolbarState.sourceFilterActive}`;
    if (previousFilterState && currentFilterState !== previousFilterState) {
      filterStatus = filtersActive ? m.toolbar_filters_applied() : m.toolbar_filters_cleared();
    }
    previousFilterState = currentFilterState;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if toolbar}
  <FeedbackPanel
    accent={toolbarAccent}
    {feedbackContext}
    open={activePanel === "feedback"}
    onclose={closePanel}
    pickerEnabled
    resetKey={pathname}
  />

  <nav
    aria-label={m.toolbar_nav_label()}
    class="pointer-events-none fixed right-0 bottom-safe-offset-3 left-0 z-20 mx-auto max-w-lg px-3"
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
                toolbarState.setSearch("");
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
            aria-controls="visibility-panel"
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

  {#if activePanel === "settings" || activePanel === "visibility"}
    <button
      class="fixed inset-x-0 top-[-100dvh] bottom-[-100dvh] z-0"
      type="button"
      aria-hidden="true"
      aria-label={m.toolbar_close_panel()}
      tabindex="-1"
      onclick={closePanel}
    ></button>
    <div
      bind:this={panelElement}
      class="fixed right-0 bottom-safe-offset-16 left-0 z-30 mx-auto max-w-lg px-3"
      style="--primary: {toolbarAccent}; --ring: {toolbarAccent}"
      transition:fly={{ duration: prefersReducedMotion.current ? 0 : 150, y: 8 }}
    >
      {#if activePanel === "settings"}
        <FoldoutPanel
          id="quick-settings-panel"
          title={m.toolbar_quick_settings()}
          onclose={closePanel}
        >
          <QuickSettingsPanel />
        </FoldoutPanel>
      {:else}
        <FoldoutPanel id="visibility-panel" title={m.toolbar_filters()} onclose={closePanel}>
          {#snippet headerActions()}
            {#if filtersActive}
              <button
                class="text-fg-amber focus-visible:outline-fg-amber flex min-h-11 items-center gap-1.5 px-2 font-controls text-[10px] hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-4"
                type="button"
                onclick={resetFilters}
                transition:fade={{ duration: prefersReducedMotion.current ? 0 : 120 }}
              >
                <IconRotate class="size-3.5" />{m.toolbar_reset_filters()}
              </button>
            {/if}
          {/snippet}
          <VisibilityPanel showSeasonality={toolbar.worldState} />
        </FoldoutPanel>
      {/if}
    </div>
  {/if}

  <p class="sr-only" role="status" aria-live="polite">{filterStatus}</p>
{/if}

<style>
  .search-bar,
  .floating-tool {
    border: 1px solid color-mix(in srgb, var(--hairline) 48%, transparent);
    border-radius: var(--radius-md);
    background: var(--paper-raised);
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
    color: var(--ink-muted);
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

  .floating-tool--filtered {
    color: var(--fg-amber);
    background: color-mix(in srgb, var(--paper-raised) 86%, var(--fg-amber));
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
