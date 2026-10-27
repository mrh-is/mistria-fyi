<script lang="ts">
  // Initialize theme store (side-effect: applies .dark class + syncs with localStorage)
  import "#lib/stores/theme.svelte.js";

  import "../app.css";

  import { onMount } from "svelte";

  import AppUpdater from "#lib/components/app-updater.svelte";
  import PencilFilter from "#lib/components/pencil-filter.svelte";
  import PersistenceWarning from "#lib/components/persistence-warning.svelte";
  import SeoHead from "#lib/components/seo-head.svelte";
  import ToolbarFooter from "#lib/components/toolbar-footer.svelte";
  import { Toaster } from "#lib/components/ui/sonner/index.js";
  import { errorPageMetadata } from "#lib/data/page-metadata.js";
  import { FeedbackContext, setFeedbackContext } from "#lib/feedback/context.svelte.js";
  import { localeFontStylesheet } from "#lib/fonts/locale-fonts.js";
  import * as m from "#lib/paraglide/messages.js";
  import { getTextDirection } from "#lib/paraglide/runtime.js";
  import { keepLocaleOffline } from "#lib/pwa/offline-locales.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";

  let { children } = $props();
  const feedbackContext = setFeedbackContext(new FeedbackContext());

  // Clear search when navigating so home search doesn't bleed into category pages
  afterNavigate(({ shallow }) => {
    if (shallow) return;

    feedbackContext.reset();
    toolbarState.closeSearch();
    toolbarState.resetSourceFilters();
  });

  onMount(() => {
    userState.loadFromStorage();
    // Browser tests wait for this before interacting: a server-rendered control clicked before
    // hydration silently drops the event. Root `onMount` runs after every child has mounted.
    document.documentElement.dataset.hydrated = "true";
  });

  let metadata = $derived(
    page.status >= 400 ? errorPageMetadata(page.status, page.data.locale) : page.data.metadata,
  );
  let hasToolbar = $derived(metadata.toolbar !== "hidden");
  let toolbarFooter = $state<{ isOverlayActive: () => boolean }>();
  let overlayActive = $derived(toolbarFooter?.isOverlayActive() ?? false);
  let fontStylesheet = $derived(localeFontStylesheet(page.data.locale));
  // Toasts sit just above the toolbar, or above an open toolbar panel so they never cover it.
  const toastOffset = "calc(56px + env(safe-area-inset-bottom))";
  let toastLift = $derived(
    toolbarState.panelClearance > 0 ? `${toolbarState.panelClearance + 8}px` : null,
  );

  // The server stamps `<html lang>`/`dir` for the first paint; a client-side locale switch (the
  // picker navigates without a reload) has to keep them in step.
  $effect(() => {
    document.documentElement.lang = page.data.locale;
    document.documentElement.dir = getTextDirection(page.data.locale);
  });

  // The service worker precaches no name chunks; the locale being read is the one kept offline.
  $effect(() => {
    keepLocaleOffline(page.data.locale);
  });
</script>

<svelte:head>
  {#if fontStylesheet}
    <link rel="stylesheet" href={fontStylesheet} />
  {/if}
</svelte:head>

<SeoHead {metadata} pathname={page.url.pathname} />

<!-- Paraglide message calls aren't reactive to the locale, so all chrome re-mounts when a client-side locale switch lands. -->
{#key page.data.locale}
  <div
    class="mx-auto flex min-h-dvh max-w-lg flex-col bg-background px-safe landscape-phone:max-w-none {hasToolbar
      ? 'pb-safe-offset-18'
      : ''}"
    inert={overlayActive ? true : undefined}
  >
    <a
      class="sr-only focus:not-sr-only focus:absolute focus:z-[var(--z-dialog)] focus:m-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      href="#main-content"
    >
      {m.skip_to_main_content()}
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

  <ToolbarFooter {metadata} bind:this={toolbarFooter} />

  <Toaster
    position="bottom-center"
    offset={{
      bottom: toastLift ? `max(${toastOffset}, ${toastLift})` : toastOffset,
      left: toastOffset,
      right: toastOffset,
      top: toastOffset,
    }}
    mobileOffset={toastLift ? { bottom: `max(16px, ${toastLift})` } : undefined}
  />

  <PersistenceWarning />
  <PencilFilter />
{/key}

<!-- Outside the locale key: a pending update must survive a client-side locale switch. -->
<AppUpdater />
