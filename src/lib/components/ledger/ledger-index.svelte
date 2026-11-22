<!--
  The page's section index: a rail beside the ledger at wide widths, & a jump list that each
  section's sticky head opens on narrower ones. The ledger's scroll controller restores the
  reading position across search and Back.
-->
<script lang="ts">
  import { tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { setLedgerIndexContext } from "#lib/components/ledger/ledger-context.js";
  import PageSearchStatus from "#lib/components/page-search-status.svelte";
  import { shelfLabel } from "#lib/presentation/shelves.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { Snippet } from "svelte";

  interface IndexSection {
    id: string;
    /** Nothing in it matches the search or filters, so the entry stays as muted text. */
    muted?: boolean;
    name: string;
    progress?: { completed: number; total: number };
  }

  let {
    children,
    sections,
  }: {
    children: Snippet;
    sections: readonly IndexSection[];
  } = $props();

  const instance = $props.id();
  const jumpListId = `${instance}-jump`;
  const wide = new MediaQuery("min-width: 72rem", false);
  setLedgerIndexContext({
    get jumpList() {
      return wide.current ? undefined : jumpListId;
    },
  });

  let current = $state("");
  let nav = $state<HTMLElement>();
  let marker = $state<{ height: number; top: number }>();
  let stickyTop = $state(0);
  /**
   * The section a link or focus just landed on. It stays current until the reader scrolls on their
   * own, since rows sizing themselves as they render can nudge the scroll position after arrival.
   */
  let arrival: undefined | { id: string };
  let frame: number | undefined;

  let grouped = $derived.by(() => {
    if (!sections.some(({ progress }) => progress)) return [{ label: "", sections }];
    const todo = sections.filter(
      ({ progress }) => !progress || progress.completed < progress.total,
    );
    const done = sections.filter(
      ({ progress }) => progress && progress.completed >= progress.total,
    );
    return [
      { label: shelfLabel("todo"), sections: todo },
      { label: shelfLabel("completed"), sections: done },
    ].filter((group) => group.sections.length > 0);
  });

  function scheduleRead(): void {
    frame ??= requestAnimationFrame(() => {
      frame = undefined;
      readPosition();
    });
  }

  function readPosition(): void {
    const scrollingElement = document.scrollingElement;
    const scrollTop = scrollingElement?.scrollTop ?? 0;
    let next = "";
    let last = "";
    const atBottom = Boolean(
      scrollingElement &&
      scrollTop > 0 &&
      scrollTop + scrollingElement.clientHeight >= scrollingElement.scrollHeight - 1,
    );
    for (const { id } of sections) {
      const heading = document.getElementById(id);
      if (!heading?.checkVisibility()) continue;
      last = id;
      if (arrival?.id === id) {
        current = id;
        return;
      }
      const target = heading.matches("[data-ledger-index-heading]")
        ? heading.parentElement
        : heading;
      /*
       * One line decides the current section for the rail, the jump list, & the sticky head: a
       * section is current once its head sticks. A link lands a section at its scroll margin,
       * which can sit just below that line while the head above it has already scrolled away.
       */
      const sectionHead = heading.querySelector<HTMLElement>("[data-ledger-head]");
      const stuckAt = sectionHead
        ? Number(getComputedStyle(sectionHead).top.replace("px", "")) || stickyTop
        : stickyTop;
      const anchorOffset =
        Number(getComputedStyle(heading).scrollMarginBlockStart.replace("px", "")) || 0;
      const reached = Math.max(stuckAt, anchorOffset) + 1;
      if (!next || (target && target.getBoundingClientRect().top <= reached)) {
        next = id;
      }
    }
    current = atBottom ? last : next;
  }

  function markArrival(event: FocusEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(":is(h2, h3)[tabindex='-1']")) return;
    const section = sections.find(({ id }) => {
      const heading = document.getElementById(id);
      return (
        heading?.contains(target) ||
        (heading?.dataset.ledgerIndexHeading !== undefined &&
          heading.parentElement?.contains(target))
      );
    });
    if (section) {
      arrival = { id: section.id };
      readPosition();
    }
  }

  function leaveArrival(): void {
    if (!arrival) return;
    arrival = undefined;
    scheduleRead();
  }

  async function readAfterRender(): Promise<void> {
    await tick();
    readPosition();
  }

  $effect(() => {
    void sections;
    void readAfterRender();
  });

  // The marker slides to the current entry, and the rail scrolls to keep it in view.
  $effect(() => {
    const id = current;
    const rail = nav;
    if (!rail || !wide.current) return;
    const link = rail.querySelector<HTMLElement>(`a[href="#${CSS.escape(id)}"]`);
    if (!link) {
      marker = undefined;
      return;
    }
    marker = { height: link.offsetHeight, top: link.offsetTop };
    if (link.offsetTop < rail.scrollTop) {
      rail.scrollTop = link.offsetTop;
    } else if (link.offsetTop + link.offsetHeight > rail.scrollTop + rail.clientHeight) {
      rail.scrollTop = link.offsetTop + link.offsetHeight - rail.clientHeight;
    }
  });

  /*
   * Sticky section heads sit just under the page header, whatever its height at this width, and
   * under the “Refresh shelves” notice while it shows, so the notice never covers them or the rail.
   */
  $effect(() => {
    const header = document.querySelector<HTMLElement>("[data-page-header]");
    if (!header) return;
    const notice = document.querySelector<HTMLElement>("[data-ledger-notice]");
    const observer = new ResizeObserver(() => {
      const noticeBottom =
        notice && notice.offsetHeight > 0
          ? (Number(getComputedStyle(notice).top.replace("px", "")) || 0) + notice.offsetHeight
          : 0;
      stickyTop = Math.max(header.offsetHeight, noticeBottom);
    });
    observer.observe(header);
    if (notice) observer.observe(notice);
    return () => {
      observer.disconnect();
    };
  });

  $effect(() => () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
  });

  /** Opens the jump list just under the page header, wherever the header sits right now. */
  function placeJumpList(event: Event): void {
    const list = event.currentTarget;
    const header = document.querySelector<HTMLElement>("[data-page-header]");
    if (!(list instanceof HTMLElement) || !header) return;
    list.style.setProperty("--jump-list-top", `${header.getBoundingClientRect().bottom}px`);
  }

  function count(value: number): string {
    return formatNumber(value, page.data.locale);
  }
</script>

<svelte:window
  onscroll={scheduleRead}
  onresize={scheduleRead}
  onwheel={leaveArrival}
  ontouchmove={leaveArrival}
  onkeydown={leaveArrival}
/>

{#snippet entries(list: readonly IndexSection[], onPick?: () => void)}
  {#each list as { id, muted, name, progress } (id)}
    {#snippet entry()}
      <span class="entry-name">{name}</span>
      {#if progress && !muted}
        <span class="leader" aria-hidden="true"></span>
        <!-- The section's own head reads its count; the index stays a list of names. -->
        <span class="entry-count" aria-hidden="true"
          ><span class="hand">{count(progress.completed)}</span> / {count(progress.total)}</span
        >
      {/if}
    {/snippet}
    <!-- A section the search or filters empty stays listed, so the rail keeps the page's shape. -->
    {#if muted}
      <span class="entry muted">{@render entry()}</span>
    {:else}
      <a
        class="entry"
        href={`#${id}`}
        aria-current={id === current ? "location" : undefined}
        onclick={() => onPick?.()}
      >
        {@render entry()}
      </a>
    {/if}
  {/each}
{/snippet}

<div class="ledger-layout" data-ledger-layout style:--ledger-sticky-top={`${stickyTop}px`}>
  <nav aria-label="Page sections" bind:this={nav}>
    {#if marker}
      <span
        class="marker"
        aria-hidden="true"
        style:translate={`0 ${marker.top}px`}
        style:block-size={`${marker.height}px`}
      ></span>
    {/if}
    {#each grouped as { label, sections: list } (label)}
      {#if label}<p class="group-label">{label}</p>{/if}
      {@render entries(list)}
    {/each}
  </nav>
  <div class="min-w-0" data-ledger-content onfocusin={markArrival}>
    <PageSearchStatus placement="ledger" />
    {@render children()}
  </div>
  {#if !wide.current}
    <div class="jump-list" id={jumpListId} popover onbeforetoggle={placeJumpList}>
      <nav aria-label="Jump to a section">
        {#each grouped as { label, sections: list } (label)}
          {#if label}<p class="group-label">{label}</p>{/if}
          {@render entries(list, () => document.getElementById(jumpListId)?.hidePopover())}
        {/each}
      </nav>
    </div>
  {/if}
</div>

<style>
  .ledger-layout > nav {
    display: none;
  }

  .group-label {
    padding: 0.75rem 0.75rem 0.25rem;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .group-label:first-of-type {
    padding-block-start: 0;
  }

  /* A wrapped name sets its leader & count on its last line, as a printed contents page does. */
  .entry {
    display: flex;
    min-block-size: 36px;
    align-items: last baseline;
    gap: 0.35rem;
    padding: 0.4rem 0.75rem;
    color: var(--color-ink-muted);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    transition: color 150ms ease-out;
  }

  .entry-name {
    min-inline-size: 0;
  }

  .leader {
    min-inline-size: 0.75rem;
    flex: 1;
    border-block-end: 1px dotted var(--color-rule);
    translate: 0 -0.25em;
  }

  .entry-count {
    flex: none;
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  /* Only the player's own count is handwritten. */
  .hand {
    color: var(--color-hand-pencil);
    font-family: var(--font-hand);
  }

  a[aria-current] {
    color: var(--primary);
  }

  /* Set back without losing contrast: italic, with no leader or count to read. */
  .entry.muted {
    font-style: italic;
  }

  .jump-list {
    inline-size: auto;
    block-size: auto;
    inset: var(--jump-list-top, 4rem) 0.75rem auto;
    max-block-size: calc(100dvh - var(--jump-list-top, 4rem) - 6rem);
    margin: 0;
    overflow: auto;
    padding-block: 0.75rem;
    border: 1px solid var(--color-rule);
    background: var(--color-paper-raised);
    box-shadow: var(--shadow-large);
  }

  .jump-list .entry {
    min-block-size: 44px;
    border-inline-start: 2px solid transparent;
  }

  .jump-list a[aria-current] {
    border-inline-start-color: var(--primary);
  }

  .jump-list::backdrop {
    background: color-mix(in srgb, var(--color-cover) 30%, transparent);
  }

  @media (min-width: 72rem) {
    .ledger-layout {
      display: grid;
      align-items: start;
      grid-template-columns: minmax(11rem, 1fr) minmax(0, 4fr);
      gap: 1.5rem;
    }

    .ledger-layout > nav {
      position: sticky;
      top: calc(var(--ledger-sticky-top, 4rem) + 1rem);
      display: flex;
      max-block-size: calc(100dvh - var(--ledger-sticky-top, 4rem) - 3rem);
      flex-direction: column;
      overflow: auto;
      padding-inline-end: 0.5rem;
      border-inline-end: 1px solid var(--color-rule-faint);
    }

    /* The rail stays in the background until the reader reaches for it. */
    .ledger-layout > nav:is(:hover, :focus-within) a:not([aria-current]) {
      color: var(--color-ink);
    }

    .marker {
      position: absolute;
      inset-block-start: 0;
      inset-inline-start: 0;
      inline-size: 2px;
      background: var(--primary);
      transition:
        translate 180ms ease-out,
        block-size 180ms ease-out;
    }

    .ledger-layout > nav .entry {
      position: relative;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .marker,
    .entry {
      transition: none;
    }
  }
</style>
