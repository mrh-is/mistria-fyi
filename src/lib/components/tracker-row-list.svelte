<script lang="ts" generics="T">
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import TrackerRowStack from "#lib/components/tracker-row-stack.svelte";
  import { createRowReveal } from "#lib/controllers/row-reveal.svelte.js";

  import type { Snippet } from "svelte";

  /**
   * A stack of tracker rows plus the empty note. The caller owns which rows exist & what a row
   * looks like; this owns when to render them. Every row renders: a long list shows its first
   * screenful at once & the rest over the next frames, reserving their height meanwhile.
   */
  let {
    getKey,
    items,
    row,
    showEmpty = true,
  }: {
    getKey: (item: T) => string;
    items: readonly T[];
    row: Snippet<[T]>;
    /** Skip the empty note when a parent shows one for a group of lists. */
    showEmpty?: boolean;
  } = $props();

  const reveal = createRowReveal(() => items.length);

  let shown = $derived(items.slice(0, reveal.count));
  let renderedRect = $state<DOMRectReadOnly | undefined>(undefined);

  $effect(() => {
    if (renderedRect) reveal.measure(renderedRect.height);
  });
</script>

<div
  bind:contentRect={renderedRect}
  data-tracker-row-list
  style:padding-block-end={reveal.reservedHeight > 0 ? `${reveal.reservedHeight}px` : undefined}
>
  <TrackerRowStack>
    {#each shown as item (getKey(item))}
      {@render row(item)}
    {/each}
  </TrackerRowStack>
</div>
{#if items.length === 0 && showEmpty}
  <TrackerEmptyState />
{/if}
