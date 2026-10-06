<script lang="ts">
  import VillagerAlphabetIndex from "#lib/components/villager-alphabet-index.svelte";

  import type { LocaleCode } from "#lib/types/locale.js";

  let {
    entries,
    locale = "en",
  }: {
    entries: { id: string; name: string }[];
    locale?: LocaleCode;
  } = $props();
</script>

<div>
  {#each entries as entry, index (`${entry.id}-${index}`)}
    <div id={entry.id} tabindex="-1" data-index-target>{entry.id}</div>
  {/each}
</div>
<VillagerAlphabetIndex {entries} {locale} />
