<script lang="ts" generics="T">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import ShelfRows from "#lib/components/shelf-rows.svelte";

  import type { ComponentProps, Snippet } from "svelte";

  import type { Shelf } from "#lib/engine/shelves.js";

  let {
    forceShelvesOpen = false,
    getKey,
    getShelf,
    isLeaving,
    items,
    row,
    showEmpty,
    ...section
  }: Omit<ComponentProps<typeof ExpandableSection>, "children"> & {
    forceShelvesOpen?: boolean;
    getKey: (item: T) => string;
    getShelf: (item: T) => Shelf | undefined;
    isLeaving?: (item: T) => boolean;
    items: readonly T[];
    row: Snippet<[T]>;
    showEmpty?: boolean;
  } = $props();
</script>

<ExpandableSection {...section}>
  <ShelfRows
    {items}
    {getKey}
    {getShelf}
    {isLeaving}
    {row}
    {showEmpty}
    forceOpen={forceShelvesOpen}
    level={section.depth ? 4 : 3}
  />
</ExpandableSection>
