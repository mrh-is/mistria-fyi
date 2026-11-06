<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { slide } from "svelte/transition";

  import ShelfHeading from "#lib/components/shelf-heading.svelte";

  import type { Snippet } from "svelte";

  import type { Shelf } from "#lib/engine/shelves.js";

  /** A shelf that starts closed and renders nothing until opened. Navigating away resets it. */
  let {
    children,
    count,
    explains = false,
    forceOpen = false,
    level = 4,
    shelf,
  }: {
    children: Snippet;
    count?: number;
    explains?: boolean;
    /** Opens the fold for as long as it holds, as a search does. */
    forceOpen?: boolean;
    level?: 2 | 3 | 4;
    shelf: Shelf;
  } = $props();

  let open = $state(false);
  let isOpen = $derived(open || forceOpen);
</script>

<ShelfHeading
  {count}
  expanded={isOpen}
  {explains}
  {level}
  onToggle={() => (open = !open)}
  {shelf}
/>
{#if isOpen}
  <div transition:slide={{ duration: prefersReducedMotion.current ? 0 : 150 }}>
    {@render children()}
  </div>
{/if}
