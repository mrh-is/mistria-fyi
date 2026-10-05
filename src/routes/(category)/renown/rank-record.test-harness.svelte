<script lang="ts">
  import RankRecord from "./rank-record.svelte";

  import type { TownRank } from "#lib/types/tracker-data.js";

  let {
    color = "#123456",
    currentLevel,
    name = "",
    rank,
    spoilered = false,
  }: {
    color?: string;
    currentLevel: number;
    name?: string;
    rank: TownRank;
    spoilered?: boolean;
  } = $props();
</script>

<ul>
  <RankRecord {color} {currentLevel} {name} {rank} {spoilered} />
</ul>
