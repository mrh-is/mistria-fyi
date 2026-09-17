<script lang="ts">
  import NpcAlphabetIndex from "$lib/components/npc-alphabet-index.svelte";
  import NpcRecord from "$lib/components/npc-record.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { getName, nameCollator } from "$lib/data/names.js";
  import { isNpcComplete } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { LocaleCode } from "$lib/types/locale.js";
  import type { NpcId } from "$lib/types/tracker-data.js";

  let {
    compact = false,
    indexed = false,
    locale,
  }: { compact?: boolean; indexed?: boolean; locale: LocaleCode } = $props();

  let npcs = $derived.by(() => {
    const collator = nameCollator(locale);
    return Object.entries(trackerData.npcs)
      .map(([id, npc]) => {
        const npcId = id as NpcId;
        return { ...npc, id: npcId, name: getName("npcs", npcId, locale) };
      })
      .sort((a, b) => collator.compare(a.name, b.name));
  });
  let visibleNpcs = $derived(
    npcs.filter(
      (npc) => userState.state.showCompleted || !isNpcComplete(npc.id, userState.state.completed),
    ),
  );
  let indexEntries = $derived(
    visibleNpcs.map((npc) => ({ id: `npc-${npc.id}`, initial: npc.name.charAt(0) })),
  );
</script>

<div class:npc-roster-shell={indexed}>
  <ul class="npc-roster" aria-label="Townsfolk roster">
    {#each visibleNpcs as npc (npc.id)}
      <NpcRecord
        {compact}
        id={npc.id}
        known={userState.progressionState.knownNpcs.has(npc.id)}
        name={npc.name}
        {npc}
      />
    {/each}
  </ul>

  {#if indexed}
    <NpcAlphabetIndex entries={indexEntries} />
  {/if}
</div>

<style>
  .npc-roster-shell {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) 24px;
    align-items: start;
    gap: 4px;
  }

  .npc-roster {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
