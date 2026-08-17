<script lang="ts">
  import CompletionRow from "$lib/components/completion-row.svelte";

  import type { AcquisitionSource } from "$lib/types/tracker-data.js";

  let {
    completed,
    name,
    onToggle,
    sources,
  }: {
    completed: boolean;
    name: string;
    onToggle: () => void;
    sources: AcquisitionSource[];
  } = $props();
</script>

<CompletionRow {completed} {name} {onToggle} {sources} />
