<script lang="ts" generics="T">
  import ShelfFold from "#lib/components/shelf-fold.svelte";
  import { SHELVES } from "#lib/engine/shelves.js";
  import { shelfLabel } from "#lib/presentation/shelves.js";

  import type { Snippet } from "svelte";

  import type { Shelf } from "#lib/engine/shelves.js";

  /**
   * Things inside a section, grouped the way a page groups its sections. The first shelf with
   * anything on it reads as the section's own list, and the shelves after it fold away.
   */
  let {
    empty,
    forceOpen = false,
    getKey,
    getShelf,
    group,
    isLeaving,
    items,
  }: {
    empty?: Snippet;
    forceOpen?: boolean;
    getKey: (item: T) => string;
    getShelf: (item: T) => Shelf | undefined;
    group: Snippet<[readonly T[]]>;
    /** A row finishing now stays where it is until it has had time to leave. */
    isLeaving?: (item: T) => boolean;
    items: readonly T[];
  } = $props();

  // Bookkeeping for leaving rows, read & written while deriving, so it's deliberately not reactive.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- See above.
  const settled = new Map<string, Shelf | undefined>();

  function shelfOf(item: T): Shelf | undefined {
    const key = getKey(item);
    if (isLeaving?.(item) && settled.has(key)) return settled.get(key);
    const shelf = getShelf(item);
    settled.set(key, shelf);
    return shelf;
  }

  let groups = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A scratch index, rebuilt per run.
    const byShelf = new Map<Shelf, T[]>();
    for (const item of items) {
      const shelf = shelfOf(item);
      if (shelf) byShelf.set(shelf, [...(byShelf.get(shelf) ?? []), item]);
    }
    return SHELVES.flatMap((shelf) => {
      const members = byShelf.get(shelf);
      return members ? [{ members, shelf }] : [];
    });
  });
</script>

{#each groups as { members, shelf }, index (shelf)}
  <div role="group" aria-label={shelfLabel(shelf)}>
    {#if index === 0}
      {@render group(members)}
    {:else}
      <ShelfFold count={members.length} {forceOpen} {shelf}>
        {@render group(members)}
      </ShelfFold>
    {/if}
  </div>
{:else}
  {@render empty?.()}
{/each}
