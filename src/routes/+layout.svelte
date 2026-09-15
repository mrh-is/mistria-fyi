<script lang="ts">
  // Initialize theme store (side-effect: applies .dark class + syncs with localStorage)
  import "$lib/stores/theme.svelte.js";

  import "../app.css";

  import { onMount } from "svelte";

  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import PencilFilter from "$lib/components/pencil-filter.svelte";
  import PersistenceWarning from "$lib/components/persistence-warning.svelte";
  import SeoHead from "$lib/components/seo-head.svelte";
  import ToolbarFooter from "$lib/components/toolbar-footer.svelte";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { resolvePageMetadata } from "$lib/data/page-metadata.js";
  import { FeedbackContext, setFeedbackContext } from "$lib/feedback/context.svelte.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let { children } = $props();
  let feedbackContext = setFeedbackContext(new FeedbackContext());

  // Clear search when navigating so home search doesn't bleed into category pages
  afterNavigate(() => {
    feedbackContext.reset();
    toolbarState.closeSearch();
    toolbarState.resetSourceFilters();
  });

  onMount(() => {
    userState.restorePersistedState();
  });

  let hasToolbar = $derived(
    page.url.pathname !== "/data" &&
      page.url.pathname !== "/about" &&
      page.url.pathname !== "/settings" &&
      page.url.pathname !== "/privacy",
  );
  let metadata = $derived(resolvePageMetadata(page.url.pathname, page.status));
  let overlayActive = $state(false);
</script>

<SeoHead {metadata} />

<div
  class="mx-auto flex min-h-dvh max-w-lg flex-col bg-background {hasToolbar
    ? 'pb-safe-offset-18'
    : ''}"
  inert={overlayActive ? true : undefined}
>
  <a
    class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
    href="#main-content"
  >
    Skip to main content
  </a>
  {#key page.url.pathname}
    <main
      id="main-content"
      class="flex flex-1 flex-col motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in"
    >
      {@render children()}
    </main>
  {/key}
</div>

<ToolbarFooter hidden={!hasToolbar} bind:overlayActive />
<Toaster position="bottom-center" offset="calc(56px + env(safe-area-inset-bottom))" />
<PersistenceWarning />
<PencilFilter />
