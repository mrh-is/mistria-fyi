<script lang="ts">
  import { ChevronDown, ChevronUp, Funnel, MessageCircleWarning, Search } from "@lucide/svelte";
  import { tick } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { fly } from "svelte/transition";

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

  $effect(() => {
    const currentPathname = pathname;
    if (previousPathname && currentPathname !== previousPathname) {
      activePanel = null;
    }
    previousPathname = currentPathname;
  });

  function closePanel(): void {
    activePanel = null;
  }

  function toggleFeedbackPanel(): void {
    activePanel = activePanel === "feedback" ? null : "feedback";
  }

  function toggleVisibilityPanel(): void {
    activePanel = activePanel === "visibility" ? null : "visibility";
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (activePanel !== "visibility" || event.key !== "Escape") return;
    event.preventDefault();
    closePanel();
    void tick().then(() => document.getElementById("visibility-panel-trigger")?.focus());
  }

  let searchInput = $state<HTMLInputElement | null>(null);
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
    toolbarState.openSearch();
    setTimeout(() => searchInput?.focus(), 50);
  }

  function closeSearch(): void {
    clearTimeout(debounceTimer);
    toolbarState.closeSearch();
  }

  $effect(() => {
    overlayActive = activePanel !== null || feedbackContext.isPicking;
  });

  let filtersActive = $derived(
    userState.state.availabilityMode !== "available" ||
      userState.state.showCompleted ||
      toolbarState.sourceFilterActive,
  );
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
    class="fixed right-0 bottom-0 left-0 z-20 mx-auto max-w-lg border-t border-border/50 bg-background pt-1.5 pb-safe-offset-2"
  >
    {#if toolbarState.searchOpen}
      <div class="flex items-center gap-2 px-3">
        <div class="relative flex-1">
          <Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            bind:ref={searchInput}
            class="px-9"
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
      <div class="flex items-center px-3">
        <div class="flex flex-1 justify-start">
          <button
            class="flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors {activePanel ===
            'feedback'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
            type="button"
            aria-label="Send feedback"
            aria-expanded={activePanel === "feedback"}
            onclick={toggleFeedbackPanel}
          >
            <MessageCircleWarning class="size-5" />
          </button>
        </div>

        <div class="flex flex-1 justify-center">
          {#if showSearch}
            <button
              class="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              type="button"
              aria-label="Search"
              onclick={openSearch}
            >
              <Search class="size-5" />
            </button>
          {/if}
        </div>

        <div class="flex flex-1 justify-end">
          <button
            class="flex min-h-11 items-center gap-1.5 rounded-md px-3 transition-colors {activePanel ===
            'visibility'
              ? 'bg-accent text-foreground'
              : filtersActive
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
            type="button"
            aria-label="Visibility filters"
            aria-expanded={activePanel === "visibility"}
            aria-controls={activePanel === "visibility" ? "visibility-panel" : undefined}
            id="visibility-panel-trigger"
            onclick={toggleVisibilityPanel}
          >
            <Funnel class="size-4" />
            {#if activePanel === "visibility"}
              <ChevronUp class="size-3 opacity-50" />
            {:else}
              <ChevronDown class="size-3 opacity-50" />
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
      class="fixed right-0 bottom-safe-offset-14 left-0 z-30 mx-auto max-w-lg px-3"
      aria-labelledby="visibility-panel-trigger"
      role="region"
      transition:fly={{ duration: prefersReducedMotion.current ? 0 : 150, y: 8 }}
    >
      <div class="rounded-xl border border-border bg-background shadow-lg">
        <VisibilityPanel {showSeasonality} />
      </div>
    </div>
  {/if}
{/if}
