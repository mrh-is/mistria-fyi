<!--
  The bound book every route renders in: the page lies on the cloth cover, wired down its left edge,
  with thumb tabs down its right. The document scrolls, not the page, so the browser's own scrolling
  (Space & PageDown, find-in-page, Back's scroll restore, `#section` links) works untouched; the
  cover & the tabs stay pinned. Below book widths the page fills the screen under a wire along its
  top, and the tabs fold into the toolbar's Contents panel.
-->
<script lang="ts">
  import BookWire from "#lib/components/book/book-wire.svelte";
  import ThumbTabs from "#lib/components/book/thumb-tabs.svelte";

  import type { Snippet } from "svelte";

  let { children, hasToolbar, inert }: { children: Snippet; hasToolbar: boolean; inert: boolean } =
    $props();
</script>

<div class="book">
  <div class="book__page" inert={inert || undefined}>
    {@render children()}
  </div>
  <BookWire />
  <div class="book__rail">
    <ThumbTabs {hasToolbar} />
  </div>
</div>

<style>
  .book {
    display: grid;
    min-height: 100dvh;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto;
  }

  .book__page {
    position: relative;
    z-index: 1;
    min-width: 0;
    min-height: calc(100dvh - 1.5rem);
    margin-top: 1.5rem;
    background-color: var(--color-paper);
    background-image: linear-gradient(to bottom, var(--color-page-gutter), transparent 1.25rem);
    box-shadow: var(--shadow-page);
    grid-area: 1 / 1;
    view-transition-name: book-page;
  }

  .book :global(.book-wire) {
    z-index: 2;
    align-self: start;
    margin-top: -0.375rem;
    grid-area: 1 / 1;
  }

  .book__rail {
    display: none;
  }

  /* Matches the `book` variant in app.css. */
  @media (min-width: 48rem) and (min-height: 32rem) {
    .book {
      grid-template-columns:
        var(--size-book-wire-width)
        minmax(0, 1fr)
        var(--size-book-rail-width);
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
      min-height: calc(100dvh - 2 * var(--size-book-margin));
      margin-block: var(--size-book-margin);
      background-image: linear-gradient(to right, var(--color-page-gutter), transparent 1.25rem);
      grid-area: 1 / 2;
    }

    /* The wire runs the page's height, through holes just inside its left edge. */
    .book :global(.book-wire) {
      align-self: stretch;
      justify-self: start;
      margin-block: calc(var(--size-book-margin) + 0.375rem);
      margin-inline-start: -1.875rem;
      grid-area: 1 / 2;
    }

    /* Just above the toolbar's layer: the feedback backdrop shares that layer & comes later in the
       DOM, and Send a note & Settings must stay clickable over it, as the toolbar's buttons do. */
    .book__rail {
      position: relative;
      z-index: calc(var(--z-toolbar) + 1);
      display: block;
      grid-area: 1 / 3;
    }
  }
</style>
