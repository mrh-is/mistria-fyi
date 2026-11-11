<script lang="ts">
  // Initialize theme store (side-effect: applies .dark class + syncs with localStorage)
  import "#lib/stores/theme.svelte.js";

  import "../app.css";

  import { onMount, untrack } from "svelte";

  import AppUpdater from "#lib/components/app-updater.svelte";
  import InstallNudgeDialog from "#lib/components/install-nudge-dialog.svelte";
  import LaneChooserDialog from "#lib/components/lane-chooser-dialog.svelte";
  import PencilFilter from "#lib/components/pencil-filter.svelte";
  import PersistenceWarning from "#lib/components/persistence-warning.svelte";
  import RouteMain from "#lib/components/route-main.svelte";
  import SeoHead from "#lib/components/seo-head.svelte";
  import SkipLink from "#lib/components/skip-link.svelte";
  import SyncReceiverHost from "#lib/components/sync/sync-receiver-host.svelte";
  import ToolbarFooter from "#lib/components/toolbar-footer.svelte";
  import { Toaster } from "#lib/components/ui/sonner/index.js";
  import { trackingReminders } from "#lib/controllers/tracking-reminders.svelte.js";
  import { errorPageMetadata } from "#lib/data/page-metadata.js";
  import { showStarterItemsToast, VISIBLE_TOASTS } from "#lib/effects/undo-toast.js";
  import { FeedbackContext, setFeedbackContext } from "#lib/feedback/context.svelte.js";
  import { localeFontStylesheet } from "#lib/fonts/locale-fonts.js";
  import { getTextDirection } from "#lib/i18n/locale-runtime.js";
  import { keepLocaleOffline } from "#lib/pwa/offline-locales.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { keepRetiring } from "#lib/sync/sharing.js";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";

  let { children } = $props();
  const feedbackContext = setFeedbackContext(new FeedbackContext());

  // Clear search when navigating so home search doesn't bleed into category pages
  afterNavigate(({ shallow }) => {
    if (shallow) return;

    feedbackContext.reset();
    toolbarState.finishSearchAfterNavigation();
    toolbarState.resetSourceFilters();
  });

  onMount(() => {
    userState.loadFromStorage();
    void trackingReminders.opened();
    // A retire the relay hasn't confirmed yet tries again on every visit, then with backoff & on
    // coming back online for as long as the page is open.
    const stopRetiring = keepRetiring();
    // Browser tests wait for this before interacting: a server-rendered control clicked before
    // hydration silently drops the event. Root `onMount` runs after every child has mounted.
    document.documentElement.dataset.hydrated = "true";
    return () => stopRetiring();
  });

  let metadata = $derived(
    page.status >= 400 ? errorPageMetadata(page.status, page.data.locale) : page.data.metadata,
  );
  $effect(() => {
    // Read progress and the dialog state so closing an install nudge can reveal a due backup.
    void userState.factCount;
    void userState.trackingLane;
    void trackingReminders.installOpen;
    void trackingReminders.checkBackup();
  });
  let hasToolbar = $derived(metadata.toolbar !== "hidden");
  let toolbarFooter = $state<{ isOverlayActive: () => boolean }>();
  let overlayActive = $derived(toolbarFooter?.isOverlayActive() ?? false);
  let fontStylesheet = $derived(localeFontStylesheet(page.data.locale));
  // Toasts sit 8 pixels above the toolbar (12 pixels of inset plus 44-pixel buttons), or above an
  // open toolbar panel so they never cover it.
  const toastOffset = "calc(56px + env(safe-area-inset-bottom))";
  const toastAboveToolbar = "calc(64px + env(safe-area-inset-bottom))";
  let toastBottom = $derived(
    toolbarState.panelClearance > 0
      ? `max(${toastAboveToolbar}, ${toolbarState.panelClearance + 8}px)`
      : toastAboveToolbar,
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

  $effect(() => {
    const batch = userState.starterItems;
    return batch && untrack(() => showStarterItemsToast(batch.count, batch.undo, batch.dismiss));
  });
</script>

<svelte:head>
  {#if fontStylesheet}
    <link rel="stylesheet" href={fontStylesheet} />
  {/if}
</svelte:head>

<SeoHead {metadata} pathname={page.url.pathname} />

<div
  class="mx-auto flex min-h-dvh max-w-lg flex-col bg-background px-safe landscape-phone:max-w-none {hasToolbar
    ? 'pb-safe-offset-18'
    : ''}"
  inert={overlayActive ? true : undefined}
>
  <SkipLink />
  <RouteMain>
    {@render children()}
  </RouteMain>
</div>

<ToolbarFooter {metadata} bind:this={toolbarFooter} />

<Toaster
  position="bottom-center"
  expand
  gap={14}
  visibleToasts={VISIBLE_TOASTS}
  offset={{
    bottom: toastBottom,
    left: toastOffset,
    right: toastOffset,
    top: toastOffset,
  }}
  mobileOffset={{ bottom: toastBottom }}
/>

<PersistenceWarning />
<LaneChooserDialog />
<InstallNudgeDialog />
<SyncReceiverHost />
<PencilFilter />
<AppUpdater />
