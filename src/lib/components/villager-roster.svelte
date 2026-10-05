<script lang="ts">
  import VillagerAlphabetIndex from "#lib/components/villager-alphabet-index.svelte";
  import VillagerRecord from "#lib/components/villager-record.svelte";
  import { buildVillagerRoster, filterVillagerRoster } from "#lib/engine/villager-roster.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { page } from "$app/state";

  import type { LocaleCode } from "#lib/types/locale.js";

  let {
    compact = false,
    indexed = false,
    locale,
  }: { compact?: boolean; indexed?: boolean; locale: LocaleCode } = $props();

  let villagers = $derived(buildVillagerRoster(locale));
  // A villager linked by hash (e.g. from search) stays rendered even when completed ones are hidden.
  let targetedId = $derived(page.url.hash.replace(/^#villager-/, ""));
  let visibleVillagers = $derived(
    filterVillagerRoster(
      villagers,
      userState.state.completed,
      userState.state.showCompleted,
      targetedId,
    ),
  );
  let indexEntries = $derived(
    visibleVillagers.map((villager) => ({
      id: `villager-${villager.id}`,
      initial: villager.name.charAt(0),
    })),
  );
</script>

<div class:villager-roster-shell={indexed}>
  <ul class="villager-roster" aria-label={m.villagers_roster_aria()}>
    {#each visibleVillagers as villager (villager.id)}
      <VillagerRecord
        {compact}
        id={villager.id}
        known={userState.progressionState.knownVillagers.has(villager.id)}
        name={villager.name}
        {villager}
      />
    {/each}
  </ul>

  {#if indexed}
    <VillagerAlphabetIndex entries={indexEntries} />
  {/if}
</div>

<style>
  .villager-roster-shell {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) 24px;
    align-items: start;
    gap: 4px;
  }

  .villager-roster {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
