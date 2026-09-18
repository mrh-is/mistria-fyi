<script lang="ts">
  import VillagerAlphabetIndex from "$lib/components/villager-alphabet-index.svelte";
  import VillagerRecord from "$lib/components/villager-record.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { getName, nameCollator } from "$lib/data/names.js";
  import { isVillagerComplete } from "$lib/engine/progress.js";
  import * as m from "$lib/paraglide/messages.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { LocaleCode } from "$lib/types/locale.js";
  import type { VillagerId } from "$lib/types/tracker-data.js";

  let {
    compact = false,
    indexed = false,
    locale,
  }: { compact?: boolean; indexed?: boolean; locale: LocaleCode } = $props();

  let villagers = $derived.by(() => {
    const collator = nameCollator(locale);
    return Object.entries(trackerData.villagers)
      .map(([id, villager]) => {
        const villagerId = id as VillagerId;
        return { ...villager, id: villagerId, name: getName("villagers", villagerId, locale) };
      })
      .sort((a, b) => collator.compare(a.name, b.name));
  });
  let visibleVillagers = $derived(
    villagers.filter(
      (villager) =>
        userState.state.showCompleted ||
        !isVillagerComplete(villager.id, userState.state.completed),
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
