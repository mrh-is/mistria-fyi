<script lang="ts">
  import { untrack } from "svelte";

  import MineFloorRecord from "#lib/components/mine-floor-record.svelte";

  import type { MinesBiome } from "#lib/types/tracker-data.js";

  let {
    biomes,
    compact = false,
    initialFloor = 0,
  }: { biomes: MinesBiome[]; compact?: boolean; initialFloor?: number } = $props();
  let floor = $state(untrack(() => initialFloor));

  function setFloor(value: number): void {
    floor = value;
  }
</script>

<MineFloorRecord {biomes} locale="en" {compact} {floor} onChange={setFloor} />
