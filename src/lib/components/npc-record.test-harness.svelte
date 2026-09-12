<script lang="ts">
  import NpcRecord from "$lib/components/npc-record.svelte";

  import type { Npc, NpcId } from "$lib/types/tracker-data.js";

  let {
    compact = false,
    id,
    known = true,
    npc,
  }: {
    compact?: boolean;
    id: NpcId;
    known?: boolean;
    npc: Npc;
  } = $props();
</script>

<ul>
  <NpcRecord {compact} {id} {known} {npc} />
</ul>
