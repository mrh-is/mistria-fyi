<script lang="ts">
  import {
    IconChevronDown,
    IconChevronUp,
    IconFilter,
    IconMessageReport,
    IconSearch,
    IconSettings,
  } from "@tabler/icons-svelte-runes";
  import { tick } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { fly } from "svelte/transition";

  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import FeedbackPanel from "$lib/components/feedback-panel.svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import VisibilityPanel from "$lib/components/visibility-panel.svelte";
  import { getFeedbackContext } from "$lib/feedback/context.svelte.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  type ActivePanel = "feedback" | "visibility" | null;

  /* eslint-disable no-useless-assignment -- $bindable default; reassigned reactively in $effect */
  let {
    hidden = false,
    overlayActive = $bindable(false),
  }: {
    hidden?: boolean;
    overlayActive?: boolean;
  } = $props();
  /* eslint-enable no-useless-assignment */
  let feedbackContext = getFeedbackContext();

  const SEARCH_ROUTES = new Set(["/", "/almanac", "/museum"]);
  const WORLD_STATE_ROUTES = new Set(["/", "/all", "/almanac", "/animals", "/museum"]);

  let pathname = $derived(page.url.pathname);
  let showSearch = $derived(SEARCH_ROUTES.has(pathname));
  let showSeasonality = $derived(WORLD_STATE_ROUTES.has(pathname));

  let activePanel = $state<ActivePanel>(null);
  let previousPathname = $state("");
  let previousPanel = $state<ActivePanel>(null);
  let visibilityPanelElement = $state<HTMLElement | null>(null);
  let visibilityPanelOpener: HTMLElement | null = null;

  $effect(() => {
    const currentPathname = pathname;
    if (previousPathname && currentPathname !== previousPathname) {
      activePanel = null;
    }
    previousPathname = currentPathname;
  });

  $effect(() => {
    if (activePanel === "visibility" && previousPanel !== "visibility") {
      void tick().then(() => visibilityPanelElement?.querySelector<HTMLElement>("button")?.focus());
    } else if (activePanel !== "visibility" && previousPanel === "visibility") {
      const focusTarget = visibilityPanelOpener;
      visibilityPanelOpener = null;
      void tick().then(() => {
        if (focusTarget?.isConnected) focusTarget.focus();
      });
    }
    previousPanel = activePanel;
  });

  function closePanel(): void {
    activePanel = null;
  }

  function toggleFeedbackPanel(): void {
    activePanel = activePanel === "feedback" ? null : "feedback";
  }

  function toggleVisibilityPanel(): void {
    if (activePanel !== "visibility") {
      visibilityPanelOpener =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    activePanel = activePanel === "visibility" ? null : "visibility";
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (activePanel !== "visibility" || event.key !== "Escape") return;
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
    setTimeout(() => searchInput?.focus(), 50);
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

  let filtersActive = $derived(
    userState.state.availabilityMode !== "available" ||
      userState.state.showCompleted ||
      toolbarState.sourceFilterActive,
  );
  let filterStatus = $state("");
  let previousFilterState = $state("");

  $effect(() => {
    const currentFilterState = `${userState.state.availabilityMode}:${userState.state.showCompleted}:${toolbarState.sourceFilterActive}`;
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
  >
    {#if toolbarState.searchOpen}
      <div
        class="pointer-events-auto flex items-center gap-2 rounded-md border border-border/60 bg-background/92 p-1 shadow-lg backdrop-blur-md"
      >
        <div class="relative flex-1">
          <IconSearch
            class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <label class="sr-only" for="tracker-search">Search items</label>
          <Input
            bind:ref={searchInput}
            class="px-9"
            id="tracker-search"
            placeholder="Search items..."
            type="text"
            value={toolbarState.searchQuery}
            oninput={handleSearchInput}
          />
          {#if toolbarState.searchQuery}
            <button
              class="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              type="button"
              aria-label="Clear search"
              onclick={() => {
                toolbarState.setSearch("");
              }}
            >
              ×
            </button>
          {/if}
        </div>
        <button
          class="min-h-11 px-2 text-sm text-muted-foreground hover:text-foreground"
          type="button"
          onclick={closeSearch}
        >
          Cancel
        </button>
      </div>
    {:else}
      <div class="flex items-end justify-between gap-3">
        <a class="floating-tool" href={resolve("/settings")} aria-label="Settings">
          <IconSettings class="size-5 transition-transform motion-reduce:transition-none" />
        </a>

        <div class="flex items-center gap-1.5">
          <button
            class="floating-tool {activePanel === 'feedback' ? 'floating-tool--active' : ''}"
            type="button"
            aria-label="Send feedback"
            aria-expanded={activePanel === "feedback"}
            onclick={toggleFeedbackPanel}
          >
            <IconMessageReport class="size-5" />
          </button>

          {#if showSearch}
            <button class="floating-tool" type="button" aria-label="Search" onclick={openSearch}>
              <IconSearch class="size-5" />
            </button>
          {/if}

          <button
            class="floating-tool gap-1.5 {activePanel === 'visibility'
              ? 'floating-tool--active'
              : filtersActive
                ? 'floating-tool--filtered'
                : ''}"
            type="button"
            aria-label="Visibility filters"
            aria-expanded={activePanel === "visibility"}
            aria-controls={activePanel === "visibility" ? "visibility-panel" : undefined}
            id="visibility-panel-trigger"
            onclick={toggleVisibilityPanel}
          >
            <IconFilter class="size-4" />
            {#if activePanel === "visibility"}
              <IconChevronUp class="size-3" />
            {:else}
              <IconChevronDown class="size-3" />
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </nav>

  {#if activePanel === "visibility"}
    <button
      class="fixed inset-x-0 top-[-100dvh] bottom-[-100dvh] z-0"
      type="button"
      aria-hidden="true"
      aria-label="Close panel"
      tabindex="-1"
      onclick={closePanel}
    ></button>

    <div
      id="visibility-panel"
      class="fixed right-0 bottom-safe-offset-16 left-0 z-30 mx-auto max-w-lg px-3"
      aria-labelledby="visibility-panel-trigger"
      role="region"
      transition:fly={{ duration: prefersReducedMotion.current ? 0 : 150, y: 8 }}
    >
      <div
        bind:this={visibilityPanelElement}
        class="rounded-xl border border-border bg-background shadow-lg"
      >
        <VisibilityPanel {showSeasonality} />
      </div>
    </div>
  {/if}
  <p class="sr-only" role="status" aria-live="polite">{filterStatus}</p>
{/if}

<style>
  .floating-tool {
    display: flex;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--hairline) 42%, transparent);
    border-radius: var(--radius-md);
    color: var(--ink-muted);
    background: color-mix(in srgb, var(--paper-raised) 91%, transparent);
    box-shadow: 0 3px 12px rgb(0 0 0 / 13%);
    backdrop-filter: blur(13px);
    pointer-events: auto;
    transition:
      box-shadow 150ms ease-out,
      color 150ms ease-out,
      transform 150ms ease-out;
  }

  .floating-tool:is(:hover, :focus-visible),
  .floating-tool--active {
    color: var(--primary);
    background: var(--paper-raised);
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
