<script lang="ts">
  import IconNotebook from "@tabler/icons-svelte-runes/icons/notebook";

  import { trackVisualViewport } from "#lib/attachments/visual-viewport.js";
  import CategoryGrid from "#lib/components/category-grid.svelte";
  import { Icon } from "#lib/components/icon/index.js";
  import OverallProgress from "#lib/components/overall-progress.svelte";
  import SearchResults from "#lib/components/search-results.svelte";
  import GotItNote from "#lib/components/sync/got-it-note.svelte";
  import SyncTroubleNote from "#lib/components/sync/sync-trouble-note.svelte";
  import WelcomeCard from "#lib/components/welcome-card.svelte";
  import { getAllProgress, getOverallProgress } from "#lib/engine/categories.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { progressImport, userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import TodaysPlaces from "./todays-places.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  let content = $state<HTMLDivElement>();

  // A replacement query reveals from the beginning. Keep its first screenful visible rather
  // than preserving a deep offset over reserved space; completion & undo keep the same query.
  $effect.pre(() => {
    const _query = toolbarState.searchQuery;
    // Reset scroll on a locale navigation, even when the query carries over.
    const _locale = data.locale;
    if (content) content.scrollTop = 0;
  });

  let allProgress = $derived(getAllProgress(userState.progressContext));

  let overall = $derived(getOverallProgress(allProgress));
  let overallPct = $derived(overall.total > 0 ? (overall.completed / overall.total) * 100 : 0);
  let overallTodoPct = $derived(overall.total > 0 ? (overall.todo / overall.total) * 100 : 0);
  let totalCompleted = $derived(formatNumber(overall.completed, data.locale));
  let grandTotal = $derived(formatNumber(overall.total, data.locale));
  let bookOwner = $derived(progressImport.lastImport);
</script>

<!-- While searching, the page pins itself to the visible viewport so the header stays on screen
     above the on-screen keyboard and only the results scroll. -->
<div
  class="home-page"
  class:home-page--searching={toolbarState.searchOpen}
  {@attach toolbarState.searchOpen ? trackVisualViewport : undefined}
>
  <header
    class="home-header"
    style="--overall-progress-percent: {overallPct}%; --overall-todo-percent: {overallTodoPct}%"
  >
    <h1 class="flex min-w-0 items-center gap-2 font-brand text-2xl leading-none">
      <IconNotebook class="size-5 shrink-0 text-(--color-brand-mark)" />
      Mistria Field Guide
    </h1>
    <OverallProgress progress={allProgress} />
    <span class="overall-progress-rule" aria-hidden="true"><i></i><b></b></span>
  </header>

  <div class="home-content flex flex-col gap-3 px-4 pb-4" bind:this={content}>
    {#if toolbarState.searchQuery}
      <SearchResults locale={data.locale} query={toolbarState.searchQuery} />
    {:else}
      {#if bookOwner?.playerName || bookOwner?.farmName}
        <p class="bookplate">
          {#if bookOwner.playerName}<span>{`Field notes of ${bookOwner.playerName}`}</span>{/if}
          {#if bookOwner.farmName}<span class="bookplate__farm">{bookOwner.farmName}</span>{/if}
        </p>
      {/if}
      <GotItNote locale={data.locale} />
      <SyncTroubleNote />
      {#if userState.trackingLane === undefined && !userState.hasAnyProgress}
        <WelcomeCard />
      {/if}
      <TodaysPlaces locale={data.locale} />
      <CategoryGrid progress={allProgress} />
      <a
        class="everything-link"
        href={localizedHref("everything")}
        aria-label={`${"Everything"}, ${totalCompleted} of ${grandTotal} completed`}
      >
        <Icon.Category category="all" class="size-4 shrink-0" />
        <span class="flex-1">Everything</span>
        <span class="font-data text-xs" aria-hidden="true">{totalCompleted} / {grandTotal}</span>
      </a>
    {/if}
  </div>
</div>

<style>
  .bookplate {
    align-self: start;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    padding: 0.35rem 0.65rem;
    border: 1px solid var(--color-rule);
    background: var(--color-paper-raised);
    font-family: var(--font-body);
    overflow-wrap: anywhere;
  }

  .bookplate__farm {
    color: var(--color-ink-muted);
  }

  .home-page {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 15px;
  }

  .home-page--searching {
    position: fixed;
    top: var(--visual-viewport-top, 0px);
    right: 0;
    left: 0;
    max-width: var(--container-lg, 32rem);
    height: var(--visual-viewport-height, 100dvh);
    margin-inline: auto;
    background: var(--color-paper);
  }

  .home-page--searching .home-header {
    flex-shrink: 0;
  }

  .home-page--searching .home-content {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    /* Clears the floating search bar, which sits at the bottom of the visible viewport. */
    padding-bottom: calc(72px + env(safe-area-inset-bottom));
  }

  .home-header {
    position: sticky;
    top: 0;
    z-index: var(--z-home-header);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: max(16px, env(safe-area-inset-top)) 22px 13px;
    background: color-mix(in srgb, var(--color-paper) 96%, transparent);
    backdrop-filter: blur(10px);
  }

  .overall-progress-rule {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    height: 3px;
    background: var(--color-paper-sunken);
  }

  .overall-progress-rule i {
    display: block;
    width: var(--overall-progress-percent);
    height: 100%;
    background: var(--color-home-accent);
    transition: width 300ms ease-out;
  }

  .overall-progress-rule b {
    display: block;
    width: var(--overall-todo-percent);
    height: 100%;
    background: color-mix(in srgb, var(--color-home-accent) 34%, transparent);
    transition: width 300ms ease-out;
  }

  .everything-link {
    display: flex;
    min-height: 44px;
    align-items: center;
    gap: 12px;
    padding: 4px 8px;
    color: var(--color-ink-muted);
    font-size: var(--text-sm);
  }

  .everything-link:is(:active, :focus-visible) {
    color: var(--color-ink);
    outline: 2px solid var(--color-home-accent);
    outline-offset: 0;
  }

  @media (hover: hover) {
    .everything-link:hover {
      color: var(--color-ink);
      outline: 2px solid var(--color-home-accent);
      outline-offset: 0;
    }
  }

  /*
   * At book widths (the `book` variant in app.css) Home's header is the page's running head, like
   * every page's, and the tools sit at its end (book-shell). It spans the page from inside Home's
   * narrower column; `cqi` is the book body's width. The keyboard lift is for phones only.
   */
  @media (min-width: 48rem) and (min-height: 34rem) {
    :global(.book--tools) .home-header {
      min-block-size: var(--ledger-header-height);
      margin-inline: calc((100% - min(100cqi, 72rem)) / 2);
      padding-block: 0.5rem;
      padding-inline: 22px calc(var(--ledger-tools-width) + var(--ledger-tools-edge) + 0.75rem);
      background: var(--color-paper-raised);
      backdrop-filter: none;
      box-shadow: var(--shadow-small);
    }

    .home-page--searching {
      position: static;
      max-width: none;
      height: auto;
      margin-inline: 0;
      background: none;
    }

    .home-page--searching .home-content {
      overflow-y: visible;
      padding-bottom: 1rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .overall-progress-rule i,
    .overall-progress-rule b {
      transition-duration: 0.01ms;
    }
  }
</style>
