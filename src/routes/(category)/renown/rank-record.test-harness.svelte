<script lang="ts">
  import RankRecord from "./rank-record.svelte";

  import type { TownRank } from "$lib/types/tracker-data.js";

  let {
    color = "#123456",
    currentLevel,
    rank,
    spoilered = false,
  }: { color?: string; currentLevel: number; rank: TownRank; spoilered?: boolean } = $props();
</script>

<ul>
  <RankRecord {color} {currentLevel} {rank} {spoilered} />
</ul>
