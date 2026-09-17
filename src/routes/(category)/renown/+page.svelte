<script lang="ts">
  import RenownCurrentRecord from "$lib/components/renown-current-record.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { getName } from "$lib/data/names.js";
  import { RANK_COLORS } from "$lib/engine/renown-presentation.js";
  import { isEntityNameVisible } from "$lib/engine/visibility.js";
  import * as m from "$lib/paraglide/messages.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import RankRecord from "./rank-record.svelte";

  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();

  function isRankVisible(minLevel: number): boolean {
    return isEntityNameVisible(
      { type: "renownLevel", level: minLevel },
      userState.progressionState,
    );
  }
</script>

<RenownCurrentRecord locale={data.locale} />

<ul class="rank-register" aria-label={m.renown_rank_register_aria()}>
  {#each trackerData.townRanks as rank, index (index)}
    <RankRecord
      color={RANK_COLORS[index] ?? "#a78bfa"}
      currentLevel={userState.state.completed.renown}
      {rank}
      name={getName("town-ranks", index.toString(), data.locale)}
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
