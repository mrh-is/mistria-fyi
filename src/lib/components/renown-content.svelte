<script lang="ts">
  import CompletionSection from "#lib/components/completion-section.svelte";
  import RankRecord from "#lib/components/rank-record.svelte";
  import RenownCurrentRecord from "#lib/components/renown-current-record.svelte";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { getMaxRenownLevel } from "#lib/engine/progress.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { townRankColor } from "#lib/utils/palette.js";

  import type { LocaleCode } from "#lib/types/locale.js";

  /** `compact` (on `/everything`) shows only the current-rank record, without the rank register. */
  let { compact = false, locale }: { compact?: boolean; locale: LocaleCode } = $props();

  function isRankVisible(minLevel: number): boolean {
    return isConditionVisible({ type: "renownLevel", level: minLevel }, userState.progressionState);
  }

  let nameFilter = $derived(toolbarState.searchQuery);

  function matchesSearch(minLevel: number, index: number): boolean {
    if (!nameFilter) return true;
    if (!isRankVisible(minLevel)) return false;
    return matchesName(getName("town-ranks", index.toString(), locale), nameFilter, locale);
  }

  // The current-rank record has no name to search, so only the register's ranks can match.
  registerPageSearch(() => {
    const matches = compact
      ? 0
      : trackerData.renown.townRanks.filter((rank, index) =>
          matchesSearch(rank.levels.start, index),
        ).length;
    return { filtered: { completed: 0, notNow: 0, todo: 0 }, visible: matches };
  });
</script>

{#if !nameFilter}
  <CompletionSection complete={userState.state.progress.renown >= getMaxRenownLevel()}>
    <RenownCurrentRecord {compact} {locale} />
  </CompletionSection>
{/if}

{#if !compact}
  <ul class="rank-register" aria-label="Town rank register">
    {#each trackerData.renown.townRanks as rank, index (index)}
      {#if matchesSearch(rank.levels.start, index)}
        <RankRecord
          color={townRankColor(index)}
          currentLevel={userState.state.progress.renown}
          {rank}
          name={getName("town-ranks", index.toString(), locale)}
          spoilered={!isRankVisible(rank.levels.start)}
        />
      {/if}
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
