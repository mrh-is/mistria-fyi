<script lang="ts">
  import RenownCurrentRecord from "$lib/components/renown-current-record.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { RANK_COLORS } from "$lib/engine/renown-presentation.js";
  import { isEntityNameVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import RankRecord from "./rank-record.svelte";

  function isRankVisible(minLevel: number): boolean {
    return isEntityNameVisible(
      { type: "renownLevel", level: minLevel },
      userState.progressionState,
    );
  }
</script>

<RenownCurrentRecord />

<ul class="rank-register" aria-label="Town rank register">
  {#each trackerData.townRanks as rank, index (rank.name)}
    <RankRecord
      color={RANK_COLORS[index] ?? "#a78bfa"}
      currentLevel={userState.state.completed.renown}
      {rank}
      spoilered={!isRankVisible(rank.levels.start)}
    />
  {/each}
</ul>

<style>
  .rank-register {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
