<script lang="ts">
  import {
    formatMergeCount,
    MERGE_COUNT_LABELS,
    totalMergeCounts,
  } from "$lib/engine/merge-labels.js";

  import type { MergeCountKey } from "$lib/engine/merge-labels.js";
  import type { MergeCounts } from "$lib/stores/user-state.svelte.js";

  let {
    counts,
    filesUsed = [],
    kind,
  }: { counts: MergeCounts; filesUsed?: string[]; kind: "import" | "transfer" } = $props();

  let total = $derived(totalMergeCounts(counts));
</script>

{#if total > 0}
  <p class="text-base font-medium text-green-800 dark:text-green-200">
    {kind === "import" ? `Imported from ${filesUsed.join(", ")}` : `Transferred ${total} items!`}
  </p>
  <ul class="mt-1 space-y-0.5 text-sm text-muted-foreground">
    {#each Object.keys(MERGE_COUNT_LABELS) as key (key)}
      {@const text = formatMergeCount(key as MergeCountKey, counts[key as MergeCountKey])}
      {#if text}
        <li>{text}</li>
      {/if}
    {/each}
  </ul>
{:else}
  <p class="text-base font-medium text-green-800 dark:text-green-200">
    {kind === "import"
      ? "No new data to import"
      : "QR code scanned successfully — no new items to add."}
  </p>
{/if}
