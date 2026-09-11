<script lang="ts">
  import NpcAlphabetIndex from "$lib/components/npc-alphabet-index.svelte";
  import NpcRecord from "$lib/components/npc-record.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isNpcComplete } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { NpcId } from "$lib/types/tracker-data.js";

  let { compact = false, indexed = false }: { compact?: boolean; indexed?: boolean } = $props();

  let npcs = $derived(
    Object.entries(trackerData.npcs)
      .map(([id, npc]) => ({ ...npc, id: id as NpcId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
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
    grid-template-columns: minmax(0, 1fr) 46px;
    align-items: start;
    gap: 8px;
  }

  .npc-roster {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (min-width: 701px) and (hover: hover) and (pointer: fine) {
    .npc-roster-shell {
      grid-template-columns: minmax(0, 1fr) 32px;
    }
  }
</style>
