<script lang="ts">
  import RankRecord from "#lib/components/rank-record.svelte";
  import RenownCurrentRecord from "#lib/components/renown-current-record.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { isEntityNameVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { townRankColor } from "#lib/utils/palette.js";

  import type { LocaleCode } from "#lib/types/locale.js";

  /** `compact` (on `/all`) shows only the current-rank record, without the rank register. */
  let { compact = false, locale }: { compact?: boolean; locale: LocaleCode } = $props();

  function isRankVisible(minLevel: number): boolean {
    return isEntityNameVisible(
      { type: "renownLevel", level: minLevel },
      userState.progressionState,
    );
  }
</script>

<RenownCurrentRecord {compact} {locale} />

{#if !compact}
  <ul class="rank-register" aria-label={m.renown_rank_register_aria()}>
    {#each trackerData.townRanks as rank, index (index)}
      <RankRecord
        color={townRankColor(index)}
        currentLevel={userState.state.completed.renown}
        {rank}
        name={getName("town-ranks", index.toString(), locale)}
        spoilered={!isRankVisible(rank.levels.start)}
      />
    {/each}
  </ul>
{/if}

<style>
  .rank-register {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
