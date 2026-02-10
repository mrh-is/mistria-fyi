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
    name,
    onToggle,
  }: {
    completed: boolean;
    dimmed?: boolean;
    hideFishSize?: boolean;
    itemId: ItemId;
    name: string;
    onToggle: () => void;
  } = $props();

  let expanded = $state(false);

  let sources = $derived(trackerData.sources[itemId] ?? []);
  let restrictions = $derived(getItemRestrictions(sources));
</script>

<div>
  <div
    class="flex items-center gap-2 rounded-md px-2 py-1 {dimmed ? 'opacity-50' : ''} {completed
      ? 'line-through opacity-40'
      : ''}"
  >
    <Checkbox checked={completed} onCheckedChange={onToggle} />
    {#if sources.length > 0}
      <button
        class="group inline-flex min-w-0 flex-1 items-center gap-0.5 text-left text-sm"
        type="button"
        onclick={() => {
          expanded = !expanded;
        }}
      >
        <span class="group-hover:underline">{name}</span>
        <ChevronRight
          class="text-muted-foreground size-3 shrink-0 opacity-0 transition-all group-hover:opacity-60 {expanded
            ? 'rotate-90'
            : ''}"
        />
      </button>
    {:else}
      <span class="min-w-0 flex-1 text-left text-sm">{name}</span>
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
