<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { slide } from "svelte/transition";

  import { LEDGER_ARRIVAL_EVENT } from "#lib/components/ledger/ledger-context.js";
  import ShelfHeading from "#lib/components/shelf-heading.svelte";

  import type { Snippet } from "svelte";

  import type { Shelf } from "#lib/engine/shelves.js";

  /** A shelf that starts closed. Navigating away resets it. */
  let {
    children,
    count,
    explains = false,
    findable = false,
    forceOpen = false,
    level = 4,
    matchCount,
    openOnArrival = false,
    shelf,
  }: {
    children: Snippet;
    count?: number;
    explains?: boolean;
    /** Lets browser Find open the fold while keeping its contents out of view. */
    findable?: boolean;
    /** Opens the fold for as long as it holds, as a search does. */
    forceOpen?: boolean;
    level?: 2 | 3 | 4;
    matchCount?: number;
    /**
     * Opens the fold when a link targets something inside it. The reader can fold it again while
     * the link stays in the URL, and a repeated link opens it again.
     */
    openOnArrival?: boolean;
    shelf: Shelf;
  } = $props();

  let open = $state(false);
  let isOpen = $derived(open || forceOpen);

  $effect(() => {
    if (openOnArrival) open = true;
  });

  function reopen(): void {
    open = true;
  }

  function listenForArrival(element: HTMLElement): () => void {
    element.addEventListener(LEDGER_ARRIVAL_EVENT, reopen);
    return () => {
      element.removeEventListener(LEDGER_ARRIVAL_EVENT, reopen);
    };
  }
</script>

<ShelfHeading
  {count}
  expanded={isOpen}
  {explains}
  {level}
  {matchCount}
  onToggle={() => (open = !open)}
  {shelf}
/>
{#if isOpen || findable}
  <div
    hidden={isOpen ? undefined : "until-found"}
    onbeforematch={() => (open = true)}
    {@attach listenForArrival}
    transition:slide={{ duration: prefersReducedMotion.current ? 0 : 150 }}
  >
    {@render children()}
  </div>
{/if}
