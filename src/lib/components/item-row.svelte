<script lang="ts">
  import CompletionRow from "$lib/components/completion-row.svelte";
  import { trackerData } from "$lib/data/index.js";

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

  let sources = $derived(trackerData.items[itemId]?.sources ?? []);
</script>

<CompletionRow {completed} {dimmed} {hideFishSize} {leaving} {name} {onToggle} {sources} />
