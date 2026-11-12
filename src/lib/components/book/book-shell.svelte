<!--
  The bound book every route renders in: the page lies on the cloth cover, wired down its left edge,
  with thumb tabs down its right. The document scrolls, not the page, so the browser's own scrolling
  (Space & PageDown, find-in-page, Back's scroll restore, `#section` links) works untouched; the
  cover & the tabs stay pinned. Below book widths the page fills the screen under a wire along its
  top, and the tabs fold into the toolbar's Contents panel.

  The shell owns what every page shares: which panel is open (`BookPanels`), what goes inert behind
  it, where the page tools sit, & the page turn between routes.
-->
<script lang="ts">
  import { untrack } from "svelte";

  import { BookPanels, setBookPanels } from "#lib/components/book/book-panels.svelte.js";
  import BookWire from "#lib/components/book/book-wire.svelte";
  import { turnPage } from "#lib/components/book/page-turn.js";
  import RailTools from "#lib/components/book/rail-tools.svelte";
  import ThumbTabs from "#lib/components/book/thumb-tabs.svelte";
  import WriteBlockedNotice from "#lib/components/book/write-blocked-notice.svelte";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import { onNavigate } from "$app/navigation";

  import type { Snippet } from "svelte";

  let {
    children,
    hasToolbar,
    tools,
  }: {
    children: Snippet;
    /** Pages without the toolbar (legal & dev pages) have no panels for the rail's tools to open. */
    hasToolbar: boolean;
    /** The page tools: a header row across the page's top at book widths, a footer on phones. */
    tools?: Snippet;
  } = $props();

  let book = $state<HTMLElement>();
  const panels = setBookPanels(new BookPanels(() => untrack(() => book) ?? document));
  const feedbackContext = getFeedbackContext();

  // While a panel is open or the feedback picker runs, the page & the thumb tabs go inert, so a
  // click through the scrim can't navigate away from a draft.
  let inert = $derived(panels.active !== null || feedbackContext.isPicking);

  onNavigate(turnPage);
</script>

<div class="book" class:book--tools={hasToolbar} bind:this={book}>
  <div class="book__page" inert={inert || undefined}>
    <div class="book__body">
      <WriteBlockedNotice />
      {@render children()}
    </div>
  </div>
  <BookWire />
  <div class="book__rail">
    <ThumbTabs {inert} />
  </div>
  {#if hasToolbar}
    <div class="book__rail-tools">
      <RailTools />
    </div>
  {/if}
  <!-- Last, so focus reaches the page tools after the rail, as before the shell. -->
  <div class="book__tools">
    {@render tools?.()}
  </div>
</div>

<style>
  /*
   * Nothing here sets a z-index on the page or the tools row, so neither is a stacking context: the
   * toolbar & its panels layer against the whole document, over the page & the rail. The tools row
   * comes after the page, so it paints over the page's paper.
   */
  .book {
    display: grid;
    min-height: 100dvh;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto;
  }

  .book__page {
    position: relative;
    min-width: 0;
    min-height: calc(100dvh - 1.5rem);
    margin-top: 1.5rem;
    background-color: var(--color-paper);
    background-image: linear-gradient(to bottom, var(--color-page-gutter), transparent 1.25rem);
    box-shadow: var(--shadow-page);
    grid-area: 1 / 1;
    view-transition-name: book-page;
  }

  .book__body {
    display: flex;
    min-height: inherit;
    flex-direction: column;
  }

  /* On phones the tools are a fixed footer, so this row takes no room. */
  .book__tools {
    grid-area: 1 / 1;
    align-self: start;
  }

  .book :global(.book-wire) {
    position: relative;
    align-self: start;
    margin-top: -0.375rem;
    grid-area: 1 / 1;
  }

  .book__rail,
  .book__rail-tools {
    display: none;
  }

  /* Matches the `book` variant in app.css. */
  @media (min-width: 48rem) and (min-height: 34rem) {
    /*
     * Two rows: the page tools, sized by what they hold, then the page's body. The page spans both
     * & lays its body in the second through a subgrid, so the tools sit on the page's paper but
     * outside it, where they stay live while the page is inert.
     */
    .book {
      --book-rail-inset: clamp(0.5rem, 3dvh, var(--size-book-margin));

      grid-template-columns:
        var(--size-book-wire-width)
        minmax(0, 1fr)
        var(--size-book-rail-width);
      grid-template-rows: auto 1fr;
      padding-block: var(--size-book-margin);
      padding-inline-start: var(--size-book-margin);
    }

    .book::before {
      position: fixed;
      z-index: 0;
      background: radial-gradient(
        ellipse 90% 80% at 50% 45%,
        transparent 50%,
        var(--color-cover-vignette) 100%
      );
      content: "";
      inset: 0;
      pointer-events: none;
    }

    .book__page {
      display: grid;
      min-height: calc(100dvh - 2 * var(--size-book-margin));
      margin-top: 0;
      background-image: linear-gradient(to right, var(--color-page-gutter), transparent 1.25rem);
      grid-area: 1 / 2 / 3 / 3;
      grid-template-rows: subgrid;
    }

    .book__body {
      min-height: 0;
      grid-row: 2;
    }

    .book--tools .book__tools {
      position: relative;
      min-width: 0;
      padding: 0.75rem 1.25rem;
      grid-area: 1 / 2;
    }

    /* The wire runs the page's height, through holes just inside its left edge. */
    .book :global(.book-wire) {
      align-self: stretch;
      justify-self: start;
      margin-block: 0.375rem;
      margin-inline-start: -1.875rem;
      grid-area: 1 / 2 / 3 / 3;
    }

    .book__rail {
      position: sticky;
      top: 0;
      display: flex;
      height: 100dvh;
      flex-direction: column;
      margin-block: calc(-1 * var(--size-book-margin));
      padding-block: var(--book-rail-inset);
      grid-area: 1 / 3 / 3 / 4;
      view-transition-name: book-rail;
    }

    /* Room at the rail's foot for Send a note & Settings, two 2rem tools & their gaps. */
    .book--tools .book__rail {
      padding-bottom: calc(var(--book-rail-inset) + 4.875rem);
    }

    /*
     * Send a note & Settings pin to the rail's foot, above the toolbar's layer: the feedback scrim
     * dims the tabs, but these stay clickable over it, as the toolbar's own buttons do, so either
     * can switch panels or close one.
     */
    .book__rail-tools {
      position: sticky;
      z-index: calc(var(--z-toolbar) + 1);
      bottom: var(--book-rail-inset);
      display: block;
      align-self: end;
      margin-bottom: calc(var(--book-rail-inset) - var(--size-book-margin));
      grid-area: 1 / 3 / 3 / 4;
      view-transition-name: book-rail-tools;
    }
  }
</style>
