<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";
  import { slide } from "svelte/transition";

  import ItemDetail from "$lib/components/item-detail.svelte";
  import RestrictionBadges from "$lib/components/restriction-badges.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getItemRestrictions } from "$lib/engine/availability.js";

  import type { ItemId } from "$lib/types/tracker-data.js";

  let {
    completed,
    dimmed = false,
    hideFishSize = false,
    itemId,
    leaving = false,
    name,
    onToggle,
  }: {
    completed: boolean;
    dimmed?: boolean;
    hideFishSize?: boolean;
    itemId: ItemId;
    leaving?: boolean;
    name: string;
    onToggle: () => void;
  } = $props();

  // Linger then fade+collapse when leaving due to completion.
  // For other removals (search filtering, bulk hide) exit instantly.
  function completeOut(node: Element) {
    // Read from DOM attribute — captures the value at last render, before reactive
    // props update in the same batch that removes this element from the {#each}.
    if (node.getAttribute("data-leaving") !== "true") return { duration: 0 };
    return {
      css: (t: number) => `opacity: ${t}; pointer-events: none;`,
      delay: 800,
      duration: 200,
      tick: (t: number) => {
        // Once fully faded, collapse the height instantly so there's no reflow pop.
        if (t === 0) {
          (node as HTMLElement).style.height = "0";
          (node as HTMLElement).style.overflow = "hidden";
        }
      },
    };
  }

  let expanded = $state(false);

  let sources = $derived(trackerData.sources[itemId] ?? []);
  let restrictions = $derived(getItemRestrictions(sources));
</script>

<div out:completeOut data-leaving={leaving}>
  <div
    class="flex items-center gap-2 rounded-md px-2 py-1.5 transition-opacity duration-200 {dimmed
      ? 'opacity-50'
      : ''} {completed || leaving ? 'line-through opacity-40' : ''}"
  >
    <Checkbox checked={completed} onCheckedChange={onToggle} />
    {#if sources.length > 0}
      <button
        class="group inline-flex min-w-0 flex-1 items-center gap-0.5 text-left text-base"
        type="button"
        onclick={() => {
          expanded = !expanded;
        }}
      >
        <span class="group-hover:underline">{name}</span>
        <ChevronRight
          class="size-3 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-60 {expanded
            ? 'rotate-90'
            : ''}"
        />
      </button>
    {:else}
      <span class="min-w-0 flex-1 text-left text-base">{name}</span>
    {/if}
    {#if restrictions.length > 0}
      <RestrictionBadges {hideFishSize} {restrictions} />
    {/if}
  </div>
  {#if expanded && sources.length > 0}
    <div transition:slide={{ duration: 150 }}>
      <ItemDetail {sources} />
    </div>
  {/if}
</div>
