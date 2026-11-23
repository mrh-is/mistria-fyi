<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import ShelfHeading from "#lib/components/shelf-heading.svelte";
  import VillagerRecord from "#lib/components/villager-record.svelte";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { categoryForKey } from "#lib/data/categories.js";
  import { isVillagerComplete, MAX_HEART_LEVEL } from "#lib/engine/progress.js";
  import { birthdayOffset, buildVillagerRoster } from "#lib/engine/villager-roster.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { matchesName } from "#lib/utils/name-match.js";

  import GroupSection from "./group-section.svelte";

  import type { VillagerRosterEntry } from "#lib/engine/villager-roster.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { VillagerId } from "#lib/types/tracker-data.js";

  let {
    anchor,
    completed = false,
    locale,
    shown = $bindable(false),
  }: {
    anchor: string;
    completed?: boolean;
    locale: LocaleCode;
    shown?: boolean;
  } = $props();

  let roster = $derived(buildVillagerRoster(locale));
  let today = $derived(userState.state.worldState);
  let met = $derived(
    roster.filter(
      ({ id, name }) =>
        userState.progressContext.progressionState.knownVillagers.has(id) &&
        matchesName(name, toolbarState.searchQuery, locale),
    ),
  );

  function hearts(id: VillagerId): number {
    return userState.state.progress.heartLevels[id] ?? 0;
  }

  let birthdays = $derived(
    today.day === undefined
      ? []
      : met
          .map((villager) => ({ offset: birthdayOffset(villager.birthday, today), villager }))
          .filter(({ offset }) => offset < 7)
          .toSorted((a, b) => a.offset - b.offset)
          .map(({ villager }) => villager),
  );
  let heartsToGo = $derived(
    met
      .filter(({ id }) => hearts(id) < MAX_HEART_LEVEL)
      .toSorted((a, b) => hearts(b.id) - hearts(a.id)),
  );
  let finished = $derived(met.filter(({ id }) => isVillagerComplete(id, userState.state.progress)));
  let villagerCount = $derived(
    completed ? finished.length : new Set([...birthdays, ...heartsToGo].map(({ id }) => id)).size,
  );
  let groupId = $derived(completed ? "sources-villagers-completed" : "sources-villagers");
  let name = $derived(categoryForKey("villagers", locale).name);

  $effect(() => {
    shown = villagerCount > 0;
  });
  registerPageSearch(() => ({
    filtered: { completed: 0, notNow: 0, todo: 0 },
    visible: villagerCount,
  }));
</script>

{#snippet rows(roster: VillagerRosterEntry[], place: string, urgent = false)}
  <ul class="villager-rows m-0 list-none p-0">
    {#each roster as villager (villager.id)}
      <VillagerRecord
        anchorId="{groupId}-{place}-{villager.id}"
        birthdaySoon={urgent}
        id={villager.id}
        ledgerLocale={locale}
        name={villager.name}
        spoilered={false}
        {villager}
      />
    {/each}
  </ul>
{/snippet}

{#snippet place(title: string, list: VillagerRosterEntry[], key: string, urgent = false)}
  {#if list.length > 0}
    <section aria-labelledby="{groupId}-{key}" class="border-rule-faint border-t">
      <div class="place-head">
        <h3 id="{groupId}-{key}" class:taped={urgent} class="font-body text-xl">{title}</h3>
        <ShelfHeading
          class="running-shelf"
          shelf="todo"
          level={4}
          explains={false}
          count={list.length}
        />
      </div>
      {@render rows(list, key, urgent)}
    </section>
  {/if}
{/snippet}

{#if villagerCount > 0}
  <GroupSection
    id={groupId}
    {name}
    {completed}
    findable
    placeGroup
    revealTarget={anchor === groupId ? anchor : ""}
  >
    {#snippet icon()}<Icon.Category category="villagers" class="size-4 shrink-0" />{/snippet}
    {#snippet count()}
      <span class="font-data text-sm font-normal text-muted-foreground"
        >{formatNumber(villagerCount, locale)}</span
      >
    {/snippet}

    {#if completed}
      {@render rows(finished, "completed")}
    {:else}
      {@render place("Birthdays this week", birthdays, "birthdays", true)}
      {@render place("Hearts to go", heartsToGo, "hearts")}
    {/if}
  </GroupSection>
{/if}

<style>
  .villager-rows {
    --villager-columns: minmax(0, 1fr) minmax(0, 17.5rem);

    container: villager-roster / inline-size;
  }

  .place-head {
    position: sticky;
    z-index: 2;
    top: calc(var(--ledger-sticky-top, 0px) + var(--ledger-group-head, 0px));
    display: flex;
    min-block-size: 3rem;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 0.75rem;
    background: var(--color-paper);
  }

  .place-head :global(.running-shelf) {
    gap: 0.375rem;
    margin-inline-start: auto;
    font-family: var(--font-data);
    font-size: var(--text-3xs);
  }

  .taped {
    padding: 0.125rem 0.5rem;
    border-block-start: 2px solid var(--color-tape-urgent);
    background: color-mix(in srgb, var(--color-tape-urgent) 18%, var(--color-paper-raised));
  }
</style>
