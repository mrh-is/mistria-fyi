<script lang="ts" generics="T">
  import ShelfGroups from "#lib/components/shelf-groups.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";

  import type { Snippet } from "svelte";

  import type { Shelf } from "#lib/engine/shelves.js";

  /** A section's tracker rows, sorted onto shelves. */
  let {
    forceOpen = false,
    getKey,
    getShelf,
    isLeaving,
    items,
    row,
    showEmpty = true,
  }: {
    forceOpen?: boolean;
    getKey: (item: T) => string;
    getShelf: (item: T) => Shelf | undefined;
    isLeaving?: (item: T) => boolean;
    items: readonly T[];
    row: Snippet<[T]>;
    showEmpty?: boolean;
  } = $props();
</script>

<ShelfGroups {forceOpen} {getKey} {getShelf} {isLeaving} {items}>
  {#snippet group(members)}
    <TrackerRowList {getKey} items={members} {row} showEmpty={false} />
  {/snippet}
  {#snippet empty()}
    <TrackerRowList {getKey} items={[]} {row} {showEmpty} />
  {/snippet}
</ShelfGroups>
