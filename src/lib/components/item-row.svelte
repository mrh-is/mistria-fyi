<script lang="ts">
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
    itemId,
    name,
    onToggle,
  }: {
    completed: boolean;
    dimmed?: boolean;
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
    <button
      class="min-w-0 flex-1 text-left text-sm"
      type="button"
      onclick={() => {
        expanded = !expanded;
      }}
    >
      {name}
    </button>
    {#if restrictions.length > 0}
      <RestrictionBadges {restrictions} />
    {/if}
  </div>
  {#if expanded && sources.length > 0}
    <div transition:slide={{ duration: 150 }}>
      <ItemDetail {sources} />
    </div>
  {/if}
</div>
