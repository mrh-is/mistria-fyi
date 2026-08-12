<script lang="ts">
  import CompletionRow from "$lib/components/completion-row.svelte";

  import type { Source } from "$lib/types/tracker-data.js";

  let {
    completed,
    name,
    onToggle,
    sources,
  }: {
    completed: boolean;
    name: string;
    onToggle: () => void;
    sources: Source[];
  } = $props();
</script>

<CompletionRow {completed} {name} {onToggle} {sources} />
