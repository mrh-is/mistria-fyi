<script lang="ts">
  import CompletionSection from "#lib/components/completion-section.svelte";
  import RenownCurrentRecord from "#lib/components/renown-current-record.svelte";
  import RenownRewardGrid from "#lib/components/renown-reward-grid.svelte";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { getMaxRenownLevel } from "#lib/engine/progress.js";
  import { renownRewards } from "#lib/presentation/renown-rewards-messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";

  import type { LocaleCode } from "#lib/types/locale.js";

  /** `compact` (on `/everything`) shows only the current-rank record, without the rank register. */
  let { compact = false, locale }: { compact?: boolean; locale: LocaleCode } = $props();

  let nameFilter = $derived(toolbarState.searchQuery);
  let level = $derived(userState.state.progress.renown);
  let rewards = $derived(compact ? [] : renownRewards(locale));
  let matching = $derived(rewards.filter(({ label }) => matchesName(label, nameFilter, locale)));
  registerPageSearch(() => ({
    filtered: { completed: 0, notNow: 0, todo: 0 },
    visible: matching.length,
  }));
</script>

{#if compact}
  {#if !nameFilter}
    <CompletionSection complete={level >= getMaxRenownLevel()}>
      <RenownCurrentRecord compact {locale} />
    </CompletionSection>
  {/if}
{:else}
  <div class="renown-layout" data-ledger-layout>
    {#if !nameFilter}
      <RenownRewardGrid {level} {locale} {rewards} />
    {/if}
    {#if matching.length}
      <h2>All rewards</h2>
    {/if}
    <ol class="reward-list" aria-label="All rewards">
      {#each matching as reward (reward.level)}
        <li class:reached={reward.level <= level}>
          {reward.label}
        </li>
      {/each}
    </ol>
  </div>
{/if}

<style>
  .renown-layout {
    inline-size: min(46rem, 100%);
    margin-inline: auto;
  }

  h2 {
    margin-block: 1rem 0.5rem;
    font-size: var(--text-xl);
  }

  .reward-list {
    max-inline-size: 46rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .reward-list li {
    padding-block: 0.35rem;
    border-block-start: 1px solid var(--color-rule);
    color: var(--color-ink-muted);
    font-size: var(--text-sm);
  }

  .reward-list li.reached {
    color: var(--color-ink);
  }
</style>
