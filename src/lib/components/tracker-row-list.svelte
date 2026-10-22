<script lang="ts" generics="T">
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import TrackerRowStack from "#lib/components/tracker-row-stack.svelte";
  import { createRowReveal } from "#lib/controllers/row-reveal.svelte.js";

  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";

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

  /**
   * Measures the rendered rows whenever the list resizes. The reserved space sits inside the stack
   * after the rows, so the rows end where it starts. Layout is fresh in a ResizeObserver callback,
   * so reading it there forces no extra layout, & it always matches the rows that were laid out.
   */
  const measureRows: Attachment<HTMLElement> = (list) => {
    const observer = new ResizeObserver(() => {
      const reserve = list.querySelector("[data-tracker-row-reserve]");
      const listBox = list.getBoundingClientRect();
      const rowsEnd = reserve ? reserve.getBoundingClientRect().top : listBox.bottom;
      reveal.measure(rowsEnd - listBox.top);
    });
    observer.observe(list);
    return () => {
      observer.disconnect();
    };
  };
</script>

<div {@attach measureRows} data-tracker-row-list aria-busy={reveal.count < items.length}>
  <TrackerRowStack>
    {#each shown as item (getKey(item))}
      {@render row(item)}
    {/each}
    {#if reveal.reservedHeight > 0}
      <!-- After the rows, so the last rendered row doesn't take the finished stack's corners. -->
      <div
        aria-hidden="true"
        data-tracker-row-reserve
        style:block-size="{reveal.reservedHeight}px"
      ></div>
    {/if}
  </TrackerRowStack>
</div>
{#if items.length === 0 && showEmpty}
  <TrackerEmptyState />
{/if}
