<script lang="ts">
  import { tick } from "svelte";

  import type { Snippet } from "svelte";

  let {
    children,
    sections,
  }: {
    children: Snippet;
    sections: readonly { id: string; name: string }[];
  } = $props();

  let current = $state("");
  let arrival: undefined | { id: string; scrollTop: number };

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
      if (arrival?.id === id && Math.abs(scrollTop - arrival.scrollTop) <= 1) {
        current = id;
        return;
      }
      const target = heading.matches("[data-ledger-index-heading]")
        ? heading.parentElement
        : heading;
      // Computed scroll margins are in pixels. Allow a pixel for scroll rounding.
      const anchorOffset = Number(
        getComputedStyle(heading).scrollMarginBlockStart.replace("px", ""),
      );
      if (!next || (target && target.getBoundingClientRect().top <= anchorOffset + 1)) {
        next = id;
      }
    }
    arrival = undefined;
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
      arrival = { id: section.id, scrollTop: document.scrollingElement?.scrollTop ?? 0 };
      readPosition();
    }
  }

  async function readAfterRender(): Promise<void> {
    await tick();
    readPosition();
  }

  $effect(() => {
    void sections;
    void readAfterRender();
  });
</script>

<svelte:window onscroll={readPosition} onresize={readPosition} />

<div class="ledger-layout" data-ledger-layout>
  <nav aria-label="Page sections">
    {#each sections as { id, name } (id)}
      <a href={`#${id}`} aria-current={id === current ? "location" : undefined}>{name}</a>
    {/each}
  </nav>
  <div class="min-w-0" onfocusin={markArrival}>
    {@render children()}
  </div>
</div>

<style>
  nav {
    display: none;
  }

  @media (min-width: 72rem) {
    .ledger-layout {
      display: grid;
      align-items: start;
      grid-template-columns: minmax(9rem, 1fr) minmax(0, 5fr);
      gap: 1.5rem;
    }

    nav {
      position: sticky;
      top: calc(var(--ledger-header-height, 4rem) + 1rem);
      display: flex;
      max-block-size: calc(100dvh - 8rem);
      flex-direction: column;
      overflow: auto;
      border-inline-end: 1px solid var(--color-ink-hairline);
      font-family: var(--font-controls);
      font-size: var(--text-sm);
    }

    a {
      display: flex;
      min-block-size: 44px;
      align-items: center;
      padding: 0.25rem 0.75rem;
      border-inline-start: 2px solid transparent;
    }

    a[aria-current] {
      color: var(--color-guide-voice);
      border-inline-start-color: currentcolor;
      font-weight: 650;
    }
  }
</style>
