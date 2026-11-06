<script lang="ts">
  import BlockySwitch from "#lib/components/blocky-switch.svelte";
  import CompletionSection from "#lib/components/completion-section.svelte";
  import ShelfGroups from "#lib/components/shelf-groups.svelte";
  import VillagerAlphabetIndex from "#lib/components/villager-alphabet-index.svelte";
  import VillagerRecord from "#lib/components/villager-record.svelte";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { getName } from "#lib/data/names.js";
  import { isVillagerComplete } from "#lib/engine/progress.js";
  import { buildVillagerRoster } from "#lib/engine/villager-roster.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { page } from "$app/state";

  import type { Shelf } from "#lib/engine/shelves.js";
  import type { VillagerRosterEntry } from "#lib/engine/villager-roster.js";
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
  let breakUpsReadOnly = $derived(
    Object.values(userState.state.progress.villagerRelationships).some(
      (relationship) => relationship === "proposed" || relationship === "married",
    ),
  );

  let villagers = $derived(buildVillagerRoster(locale));
  // A villager linked by hash (e.g. from search) opens the fold they sit in.
  let targetedId = $derived(page.url.hash.replace(/^#villager-/, ""));
  let nameFilter = $derived(toolbarState.searchQuery);
  // The alphabet index can jump to anyone, so using it opens the folds.
  let indexOpenedFolds = $state(false);
  // Spoilered villagers render without their name, so a search can't find them.
  let namedVillagers = $derived(
    nameFilter
      ? villagers.filter(
          ({ id, name }) =>
            userState.progressionState.knownVillagers.has(id) &&
            matchesName(name, nameFilter, locale),
        )
      : villagers,
  );
  let visibleVillagers = $derived(namedVillagers);

  function villagerShelf(villager: VillagerRosterEntry): Shelf {
    if (isVillagerComplete(villager.id, userState.state.progress)) return "completed";
    const met = isConditionVisible(villager.visibility, userState.progressContext.progressionState);
    return met ? "todo" : "notNow";
  }

  registerPageSearch(() => ({
    filtered: { completed: 0, notNow: 0, todo: 0 },
    visible: visibleVillagers.length,
  }));

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

{#snippet roster(rows: readonly VillagerRosterEntry[])}
  <ul
    class="villager-roster"
    data-testid="villager-roster"
    aria-label={m.villagers_roster_aria()}
    tabindex="-1"
  >
    {#each rows as villager (villager.id)}
      <CompletionSection complete={isVillagerComplete(villager.id, userState.state.progress)}>
        <VillagerRecord
          {compact}
          id={villager.id}
          name={villager.name}
          spoilered={!userState.progressionState.knownVillagers.has(villager.id)}
          {villager}
        />
      </CompletionSection>
    {/each}
  </ul>
{/snippet}

{#if !compact && showBreakUpsSetting && !breakUpsReadOnly && !nameFilter}
  <div class="break-ups-setting">
    <BlockySwitch
      checked={userState.state.progress.breakUpsDisabled}
      label={getName("ui", "disable_break_ups", locale)}
      onCheckedChange={(value) => userState.setBreakUpsDisabled(value)}
    >
      <span>{getName("ui", "disable_break_ups", locale)}</span>
    </BlockySwitch>
    <p>{m.villagers_break_ups_hint()}</p>
  </div>
{/if}

<div class:villager-roster-shell={indexed}>
  {#if compact}
    {@render roster(visibleVillagers)}
  {:else}
    <div class="min-w-0">
      <ShelfGroups
        explains
        level={2}
        forceOpen={!!nameFilter || Boolean(targetedId) || indexOpenedFolds}
        getKey={(villager) => villager.id}
        getShelf={villagerShelf}
        group={roster}
        items={visibleVillagers}
      />
    </div>
  {/if}

  {#if indexed}
    <VillagerAlphabetIndex
      entries={indexEntries}
      {locale}
      revealTargets={() => {
        indexOpenedFolds = true;
      }}
    />
  {/if}
</div>

{#if !compact && breakUpsReadOnly}
  <p class="break-ups-status">
    {userState.state.progress.breakUpsDisabled
      ? m.villagers_break_ups_disabled()
      : m.villagers_break_ups_enabled()}
  </p>
{/if}

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
  }

  .break-ups-status {
    margin-top: 16px;
    color: var(--color-ink-muted);
    font-size: var(--text-xs);
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
