<script lang="ts" generics="T">
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import TrackerRowStack from "#lib/components/tracker-row-stack.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { SECTION_LIMIT, sectionRenderTarget } from "#lib/utils/row-display.js";

  import type { Snippet } from "svelte";

  /**
   * A stack of tracker rows plus what surrounds it: the empty note and, for long sections, the
   * "show more" button. The caller owns which rows exist & what a row looks like; this owns when
   * to render them.
   */
  let {
    expanded = false,
    getKey,
    items,
    limited = false,
    loadingMessage,
    onShowMore,
    renderedCount,
    row,
    showEmpty = true,
  }: {
    /** Whether the section has been expanded past `SECTION_LIMIT`; read only when `limited`. */
    expanded?: boolean;
    getKey: (item: T) => string;
    items: readonly T[];
    /** Cap the section at `SECTION_LIMIT` rows until it is expanded. */
    limited?: boolean;
    /** Shown while `renderedCount` is zero but rows exist (progressive rendering). */
    loadingMessage?: string;
    /** Called when "show more" is pressed; the caller flips `expanded`. */
    onShowMore?: () => void;
    /** Progressive rendering: render at most this many rows, within the limit. */
    renderedCount?: number;
    row: Snippet<[T]>;
    /** Skip the empty note when a parent shows one for a group of lists. */
    showEmpty?: boolean;
  } = $props();

  let renderTarget = $derived(limited ? sectionRenderTarget(items.length, expanded) : items.length);
  let shown = $derived(items.slice(0, Math.min(renderTarget, renderedCount ?? renderTarget)));
  let hiddenCount = $derived(limited && !expanded ? items.length - SECTION_LIMIT : 0);
</script>

<TrackerRowStack>
  {#each shown as item (getKey(item))}
    {@render row(item)}
  {/each}
</TrackerRowStack>
{#if items.length === 0}
  {#if showEmpty}
    <TrackerEmptyState />
  {/if}
{:else if loadingMessage && shown.length === 0}
  <TrackerEmptyState message={loadingMessage} />
{/if}
{#if hiddenCount > 0}
  <div class="flex justify-center py-1">
    <Button class="h-7 text-sm text-muted-foreground" variant="ghost" onclick={onShowMore}>
      {m.show_more_count({ count: hiddenCount })}
    </Button>
  </div>
{/if}
