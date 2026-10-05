<script lang="ts">
  import VillagerAlphabetIndex from "#lib/components/villager-alphabet-index.svelte";

  let {
    entries,
    reducedMotion,
  }: {
    entries: { id: string; initial: string }[];
    reducedMotion?: boolean;
  } = $props();
</script>

<div>
  {#each entries as entry, index (`${entry.id}-${index}`)}
    <div id={entry.id} tabindex="-1" data-index-target>{entry.id}</div>
  {/each}
</div>
<VillagerAlphabetIndex {entries} {reducedMotion} />
