<script lang="ts">
  import BlockySwitch from "#lib/components/blocky-switch.svelte";
  import VillagerAlphabetIndex from "#lib/components/villager-alphabet-index.svelte";
  import VillagerRecord from "#lib/components/villager-record.svelte";
  import { getName } from "#lib/data/names.js";
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

  let showBreakUpsSetting = $derived(
    userState.state.progress.breakUpsDisabled ||
      Object.values(userState.state.progress.villagerRelationships).some(
        (relationship) =>
          relationship === "romantic" || relationship === "proposed" || relationship === "married",
      ),
  );

  let villagers = $derived(buildVillagerRoster(locale));
  // A villager linked by hash (e.g. from search) stays rendered even when completed ones are hidden.
  let targetedId = $derived(page.url.hash.replace(/^#villager-/, ""));
  let visibleVillagers = $derived(
    filterVillagerRoster(
      villagers,
      userState.state.progress,
      userState.state.showCompleted,
      targetedId,
    ),
  );
  // Spoilered villagers render without their name, so their initials stay out of the index too.
  let indexEntries = $derived(
    visibleVillagers
      .filter((villager) => userState.progressionState.knownVillagers.has(villager.id))
      .map((villager) => ({
        id: `villager-${villager.id}`,
        name: villager.name,
      })),
  );
</script>

{#if !compact && showBreakUpsSetting}
  <div class="break-ups-setting">
    <BlockySwitch
      checked={userState.state.progress.breakUpsDisabled}
      label={getName("ui", "disable_break_ups", locale)}
      onCheckedChange={(value) => userState.setBreakUpsDisabled(value)}
    >
      <span>{getName("ui", "disable_break_ups", locale)}</span>
    </BlockySwitch>
    <p>{getName("ui", "disable_break_ups_description", locale)}</p>
  </div>
{/if}

<div class:villager-roster-shell={indexed}>
  <ul
    class="villager-roster"
    data-testid="villager-roster"
    aria-label={m.villagers_roster_aria()}
    tabindex="-1"
  >
    {#each visibleVillagers as villager (villager.id)}
      <VillagerRecord
        {compact}
        id={villager.id}
        name={villager.name}
        spoilered={!userState.progressionState.knownVillagers.has(villager.id)}
        {villager}
      />
    {/each}
  </ul>

  {#if indexed}
    <VillagerAlphabetIndex entries={indexEntries} {locale} />
  {/if}
</div>

<style>
  .break-ups-setting {
    display: grid;
    gap: 6px;
    margin-bottom: 16px;
    padding: 12px;
    border: 1px solid var(--color-ink-hairline);
    background: var(--color-paper-raised);
  }

  .break-ups-setting p {
    margin: 0;
    color: var(--color-ink-muted);
    font-size: var(--text-xs);
    white-space: pre-line;
  }

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
