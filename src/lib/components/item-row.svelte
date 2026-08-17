<script lang="ts">
  import CompletionRow from "$lib/components/completion-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { getDisplayBadges } from "$lib/engine/availability.js";

  import type { ItemId } from "$lib/types/tracker-data.js";

  let {
    completed,
    dimmed = false,
    itemId,
    leaving = false,
    name,
    onToggle,
  }: {
    completed: boolean;
    dimmed?: boolean;
    itemId: ItemId;
    leaving?: boolean;
    name: string;
    onToggle: () => void;
  } = $props();

  let sources = $derived(trackerData.items[itemId]?.sources ?? []);
  let badges = $derived(getDisplayBadges(sources));
</script>

<CompletionRow {badges} {completed} {dimmed} {leaving} {name} {onToggle} {sources} />
