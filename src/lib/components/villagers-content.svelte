<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";

  import BlockySwitch from "#lib/components/blocky-switch.svelte";
  import CompletionSection from "#lib/components/completion-section.svelte";
  import { Icon } from "#lib/components/icon/index.js";
  import ShelfHeading from "#lib/components/shelf-heading.svelte";
  import VillagerRecord from "#lib/components/villager-record.svelte";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { getName } from "#lib/data/names.js";
  import { isVillagerComplete, MAX_HEART_LEVEL } from "#lib/engine/progress.js";
  import { SHELVES } from "#lib/engine/shelves.js";
  import { birthdayOffset, buildVillagerRoster } from "#lib/engine/villager-roster.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { captureFocusFallback } from "#lib/utils/focus-fallback.js";
  import { formatNumber, seasonLabelAbbr } from "#lib/utils/format.js";
  import { matchesName } from "#lib/utils/name-match.js";

  import type { Shelf } from "#lib/engine/shelves.js";
  import type { VillagerRosterEntry } from "#lib/engine/villager-roster.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  let { compact = false, locale }: { compact?: boolean; locale: LocaleCode } = $props();
  const wide = new MediaQuery("min-width: 64rem", false);

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
  let nameFilter = $derived(toolbarState.searchQuery);
  let today = $derived(userState.state.worldState);
  // Spoilered villagers render without their name, so a search can't find them.
  let visibleVillagers = $derived(
    nameFilter
      ? villagers.filter(
          ({ id, name }) =>
            userState.progressionState.knownVillagers.has(id) &&
            matchesName(name, nameFilter, locale),
        )
      : villagers,
  );

  registerPageSearch(() => ({
    filtered: { completed: 0, notNow: 0, todo: 0 },
    visible: visibleVillagers.length,
  }));

  function byBirthday(a: VillagerRosterEntry, b: VillagerRosterEntry): number {
    return birthdayOffset(a.birthday, today) - birthdayOffset(b.birthday, today);
  }

  let birthdays = $derived(
    visibleVillagers
      .filter((villager) => userState.progressionState.knownVillagers.has(villager.id))
      .toSorted(byBirthday)
      .slice(0, 7),
  );

  type LedgerEntry =
    | { count: number; key: string; shelf: Shelf; villager?: undefined }
    | { key: string; shelf: Shelf; villager: VillagerRosterEntry };

  // One keyed list lets an edited row keep its meter and animation when it changes shelves.
  let ledger = $derived.by(() => {
    if (compact) return [];
    const groups: Record<Shelf, VillagerRosterEntry[]> = { completed: [], notNow: [], todo: [] };
    for (const villager of visibleVillagers) {
      const known = userState.progressionState.knownVillagers.has(villager.id);
      const level = userState.state.progress.heartLevels[villager.id] ?? 0;
      let shelf: Shelf = "notNow";
      if (known) shelf = level >= MAX_HEART_LEVEL ? "completed" : "todo";
      groups[shelf].push(villager);
    }
    groups.todo.sort(byBirthday);
    return SHELVES.flatMap((shelf): LedgerEntry[] => {
      const rows = groups[shelf];
      if (rows.length === 0) return [];
      return [
        { count: rows.length, key: shelf, shelf },
        ...rows.map((villager) => ({ key: `villager-${villager.id}`, shelf, villager })),
      ];
    });
  });

  let restoreFocus: (() => Promise<void>) | undefined;
  $effect.pre(() => {
    if (compact) return;
    void ledger;
    restoreFocus = captureFocusFallback();
  });
  $effect(() => {
    void ledger;
    if (restoreFocus) void restoreFocus();
    restoreFocus = undefined;
  });
</script>

{#if !compact && showBreakUpsSetting && !breakUpsReadOnly && !nameFilter}
  <div class="break-ups-setting">
    <BlockySwitch
      checked={userState.state.progress.breakUpsDisabled}
      label={getName("ui", "disable_break_ups", locale)}
      onCheckedChange={(value) => userState.setBreakUpsDisabled(value)}
    >
      <span>{getName("ui", "disable_break_ups", locale)}</span>
    </BlockySwitch>
    <p>Match this to your game’s setting before you get engaged.</p>
  </div>
{/if}

{#if compact}
  <ul
    class="villager-roster"
    data-testid="villager-roster"
    aria-label="Villager roster"
    tabindex="-1"
  >
    {#each visibleVillagers as villager (villager.id)}
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
{:else}
  <div class="villager-layout" data-ledger-layout>
    {#if birthdays.length > 0}
      <nav aria-label="Birthdays next">
        <details open={wide.current}>
          <summary>Birthdays next</summary>
          <ul>
            {#each birthdays as villager (villager.id)}
              <li>
                <a href="#villager-{villager.id}">
                  <span>{villager.name}</span>
                  <span class="leader" aria-hidden="true"></span>
                  <span class="rail-date">
                    <Icon.Season season={villager.birthday.season} class="size-3 shrink-0" />
                    {seasonLabelAbbr(villager.birthday.season)}
                    {formatNumber(villager.birthday.day, locale)}
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </details>
      </nav>
    {/if}

    <ul
      class="villager-roster ledger"
      data-testid="villager-roster"
      aria-label="Villager roster"
      tabindex="-1"
    >
      {#each ledger as entry (entry.key)}
        {#if entry.villager}
          {@const villager = entry.villager}
          <VillagerRecord
            birthdaySoon={today.day !== undefined && birthdayOffset(villager.birthday, today) <= 7}
            id={villager.id}
            ledgerLocale={locale}
            name={villager.name}
            spoilered={entry.shelf === "notNow"}
            {villager}
          />
        {:else}
          <li class="running-head">
            <ShelfHeading
              count={entry.count}
              explains={false}
              note={entry.shelf === "notNow" ? "Not met yet" : undefined}
              shelf={entry.shelf}
            />
            {#if entry.shelf !== "notNow"}
              <div class="columns" aria-hidden="true">
                <span>Villager · birthday</span>
                <span>Hearts</span>
              </div>
            {/if}
          </li>
        {/if}
      {/each}
    </ul>
  </div>
{/if}

{#if !compact && breakUpsReadOnly}
  <p class="break-ups-status">
    {userState.state.progress.breakUpsDisabled ? "Break-ups disabled" : "Break-ups enabled"}
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

  .villager-layout {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 12px 24px;
  }

  .villager-layout nav {
    color: var(--color-ink-muted);
  }

  .villager-layout summary {
    padding-block: 5px;
    cursor: pointer;
  }

  .villager-layout summary,
  .columns {
    font-family: var(--font-data);
    font-size: var(--text-3xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .columns span:first-child {
    padding-inline-start: 38px;
  }

  .villager-layout nav a {
    display: flex;
    min-block-size: 32px;
    align-items: baseline;
    gap: 4px;
    font-size: var(--text-sm);
  }

  .villager-layout nav a:is(:hover, :focus-visible) {
    color: var(--color-ink);
  }

  .leader {
    min-inline-size: 6px;
    flex: 1;
    border-block-end: 1px dotted var(--color-rule);
  }

  .rail-date {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 3px;
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
  }

  .ledger {
    --villager-columns: minmax(9rem, 35%) minmax(15rem, 17.5rem) minmax(0, 1fr);

    container: villager-roster / inline-size;
    grid-column: -2 / -1;
  }

  .running-head {
    margin-block-start: 20px;
    border-block-end: 1px solid var(--color-rule);
  }

  .running-head:first-child {
    margin-block-start: 0;
  }

  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    padding-block: 4px;
    color: var(--color-ink-muted);
    column-gap: 12px;
  }

  @container villager-roster (min-width: 28rem) {
    .columns {
      grid-template-columns: var(--villager-columns);
    }
  }

  @media (min-width: 64rem) {
    .villager-layout {
      grid-template-columns: minmax(10rem, 1fr) minmax(0, 4fr);
    }

    .villager-layout nav {
      position: sticky;
      top: calc(88px + env(safe-area-inset-top));
    }
  }

  @media (pointer: coarse) {
    .villager-layout nav a {
      min-block-size: 44px;
    }
  }

  .villager-roster {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
