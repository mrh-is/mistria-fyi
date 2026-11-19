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

  function readPosition(): void {
    let next = sections[0]?.id ?? "";
    for (const { id } of sections) {
      const heading = document.getElementById(id);
      if (!heading?.checkVisibility()) continue;
      const target = heading.matches("[data-ledger-index-heading]")
        ? heading.parentElement
        : heading;
      if (!target || target.getBoundingClientRect().top > 161) break;
      next = id;
    }
    current = next;
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
  <div class="min-w-0">
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
      top: calc(var(--ledger-sticky-top, 0px) + 5rem);
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
