<script lang="ts">
  import NpcRecord from "$lib/components/npc-record.svelte";

  import type { Npc, NpcId } from "$lib/types/tracker-data.js";

  let {
    compact = false,
    id,
    known = true,
    name,
    npc,
  }: {
    compact?: boolean;
    id: NpcId;
    known?: boolean;
    name: string;
    npc: Npc;
  } = $props();
</script>

<ul>
  <NpcRecord {compact} {id} {known} locale="en" {name} {npc} />
</ul>
