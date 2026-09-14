<script lang="ts">
  import {
    IconFilter,
    IconMessageReport,
    IconRotate,
    IconSearch,
    IconSettings,
  } from "@tabler/icons-svelte-runes";
  import { flushSync, tick } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { fade, fly } from "svelte/transition";

  import { page } from "$app/state";
  import FeedbackPanel from "$lib/components/feedback-panel.svelte";
  import FoldoutPanel from "$lib/components/foldout-panel.svelte";
  import QuickSettingsPanel from "$lib/components/quick-settings-panel.svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import VisibilityPanel from "$lib/components/visibility-panel.svelte";
  import { getFeedbackContext } from "$lib/feedback/context.svelte.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { DEFAULT_AVAILABILITY_WINDOWS } from "$lib/types/availability.js";

  type ActivePanel = "feedback" | "settings" | "visibility" | null;

  /* eslint-disable no-useless-assignment -- $bindable default; reassigned reactively in $effect */
  let {
    hidden = false,
    overlayActive = $bindable(false),
  }: {
    hidden?: boolean;
    overlayActive?: boolean;
  } = $props();
  /* eslint-enable no-useless-assignment */

  const SEARCH_ROUTES = new Set(["/", "/almanac", "/museum"]);
  const WORLD_STATE_ROUTES = new Set(["/", "/all", "/almanac", "/animals", "/museum"]);

  let feedbackContext = getFeedbackContext();
  let pathname = $derived(page.url.pathname);
  let showSearch = $derived(SEARCH_ROUTES.has(pathname));
  let showSeasonality = $derived(WORLD_STATE_ROUTES.has(pathname));
  const TOOLBAR_ACCENTS: Record<string, string> = {
    "/almanac": "var(--cat-almanac)",
    "/animals": "var(--cat-animals)",
    "/cosmetics": "var(--cat-cosmetics)",
    "/mines": "var(--cat-mines)",
    "/museum": "var(--cat-museum)",
    "/npcs": "var(--cat-npcs)",
    "/quests": "var(--cat-quests)",
    "/recipes": "var(--cat-recipes)",
    "/renown": "var(--cat-renown)",
    "/skills": "var(--cat-skills)",
  };
  let toolbarAccent = $derived(TOOLBAR_ACCENTS[pathname] ?? "var(--home-accent)");

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

  $effect(() => {
    if (activePanel !== null && activePanel !== "feedback" && activePanel !== previousPanel) {
      void tick().then(() => panelElement?.querySelector<HTMLElement>("button, a")?.focus());
    } else if (activePanel === null && previousPanel !== null) {
      const focusTarget = panelOpener;
      panelOpener = null;
      void tick().then(() => {
        if (focusTarget?.isConnected) focusTarget.focus();
      });
    }
    previousPanel = activePanel;
  });

  function closePanel(): void {
    activePanel = null;
  }

  function togglePanel(panel: Exclude<ActivePanel, null>): void {
    if (activePanel !== panel) {
      panelOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    activePanel = activePanel === panel ? null : panel;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (activePanel === null || activePanel === "feedback" || event.key !== "Escape") return;
    event.preventDefault();
    closePanel();
  }

  let searchInput = $state<HTMLInputElement | null>(null);
  let searchOpener: HTMLElement | null = null;
  let debounceTimer: ReturnType<typeof setTimeout>;

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

  function closeSearch(): void {
    clearTimeout(debounceTimer);
    toolbarState.closeSearch();
    const focusTarget = searchOpener;
    searchOpener = null;
    void tick().then(() => {
      const restoredTarget = focusTarget?.isConnected
        ? focusTarget
        : document.querySelector<HTMLElement>(
            'nav[aria-label="Tracker tools"] button[aria-label="Search"]',
          );
      restoredTarget?.focus();
    });
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
      filterStatus = filtersActive ? "Filters applied" : "All filters cleared";
    }
    previousFilterState = currentFilterState;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if !hidden}
  <FeedbackPanel
    {feedbackContext}
    open={activePanel === "feedback"}
    onclose={closePanel}
    pickerEnabled
    resetKey={pathname}
  />

  <nav
    aria-label="Tracker tools"
    class="pointer-events-none fixed right-0 bottom-safe-offset-3 left-0 z-20 mx-auto max-w-lg px-3"
    style="--primary: {toolbarAccent}; --ring: {toolbarAccent}"
  >
    {#if toolbarState.searchOpen}
      <div class="search-bar pointer-events-auto flex items-center gap-2 p-1 shadow-lg">
        <div class="relative flex-1">
          <IconSearch
            class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <label class="sr-only" for="tracker-search">Search items</label>
          <Input
            bind:ref={searchInput}
            class="px-9"
            id="tracker-search"
            placeholder="Search items…"
            type="text"
            value={toolbarState.searchQuery}
            oninput={handleSearchInput}
          />
          {#if toolbarState.searchQuery}
            <button
              class="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
              type="button"
              aria-label="Clear search"
              onclick={() => {
                toolbarState.setSearch("");
              }}>×</button
            >
          {/if}
        </div>
        <button
          class="min-h-11 px-2 font-controls text-xs text-muted-foreground hover:text-foreground"
          type="button"
          onclick={closeSearch}>Cancel</button
        >
      </div>
    {:else}
      <div class="flex items-end justify-between gap-3">
        <div class="flex items-center gap-1.5">
          <button
            class="floating-tool {activePanel === 'settings' ? 'floating-tool--active' : ''}"
            type="button"
            aria-label="Quick settings"
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
            aria-label="Send feedback"
            aria-expanded={activePanel === "feedback"}
            onclick={() => {
              togglePanel("feedback");
            }}
          >
            <IconMessageReport class="size-5" />
          </button>
        </div>

        <div class="flex items-center gap-1.5">
          {#if showSearch}
            <button class="floating-tool" type="button" aria-label="Search" onclick={openSearch}>
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
            aria-label="Visibility filters"
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
      aria-label="Close panel"
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
        <FoldoutPanel id="quick-settings-panel" title="Quick settings" onclose={closePanel}>
          <QuickSettingsPanel />
        </FoldoutPanel>
      {:else}
        <FoldoutPanel id="visibility-panel" title="Filters" onclose={closePanel}>
          {#snippet headerActions()}
            {#if filtersActive}
              <button
                class="text-fg-amber focus-visible:outline-fg-amber flex min-h-11 items-center gap-1.5 px-2 font-controls text-[10px] hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-4"
                type="button"
                onclick={resetFilters}
                transition:fade={{ duration: prefersReducedMotion.current ? 0 : 120 }}
              >
                <IconRotate class="size-3.5" />Reset
              </button>
            {/if}
          {/snippet}
          <VisibilityPanel {showSeasonality} />
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

  .floating-tool {
    display: flex;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    color: var(--ink-muted);
    box-shadow: 0 3px 12px rgb(0 0 0 / 13%);
    pointer-events: auto;
    transition:
      box-shadow 150ms ease-out,
      color 150ms ease-out,
      transform 150ms ease-out;
  }

  .floating-tool:is(:hover, :focus-visible),
  .floating-tool--active {
    color: var(--primary);
    box-shadow: 0 6px 16px rgb(0 0 0 / 18%);
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    transform: translateY(-2px);
  }

  .floating-tool--filtered {
    color: var(--fg-amber);
    background: color-mix(in srgb, var(--paper-raised) 86%, var(--fg-amber));
  }

  .floating-tool:first-child:is(:hover, :focus-visible) :global(svg) {
    transform: rotate(-7deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .floating-tool,
    .floating-tool:first-child :global(svg) {
      transition-duration: 0.01ms;
    }

    .floating-tool:is(:hover, :focus-visible),
    .floating-tool--active,
    .floating-tool:first-child:is(:hover, :focus-visible) :global(svg) {
      transform: none;
    }
  }
</style>
