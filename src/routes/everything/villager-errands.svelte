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
  import { captureFocusFallback } from "#lib/utils/focus-fallback.js";
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
    roster.filter(({ id }) => userState.progressContext.progressionState.knownVillagers.has(id)),
  );
  let matchingVillagers = $derived(
    new Set(
      met
        .filter(({ name }) => matchesName(name, toolbarState.searchQuery, locale))
        .map(({ id }) => id),
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
  let relationships = $derived(
    met.filter(
      ({ id }) =>
        hearts(id) >= MAX_HEART_LEVEL && !isVillagerComplete(id, userState.state.progress),
    ),
  );
  let finished = $derived(met.filter(({ id }) => isVillagerComplete(id, userState.state.progress)));
  let groupRows = $derived(completed ? finished : [...birthdays, ...heartsToGo, ...relationships]);
  let matchCount = $derived(
    new Set(groupRows.filter(({ id }) => matchingVillagers.has(id)).map(({ id }) => id)).size,
  );
  let groupId = $derived(completed ? "sources-villagers-completed" : "sources-villagers");
  let name = $derived(categoryForKey("villagers", locale).name);
  let restoreFocus: (() => Promise<void>) | undefined;

  $effect.pre(() => {
    void relationships;
    void matchingVillagers;
    if (!completed) restoreFocus = captureFocusFallback();
  });
  $effect(() => {
    void relationships;
    void matchingVillagers;
    const restore = restoreFocus;
    restoreFocus = undefined;
    if (restore) void restore();
  });

  $effect(() => {
    shown = matchCount > 0;
  });
  registerPageSearch(() => ({
    filtered: { completed: 0, notNow: 0, todo: 0 },
    visible: matchCount,
  }));
</script>

{#snippet rows(roster: VillagerRosterEntry[], place: string, urgent = false)}
  <ul class="villager-rows m-0 list-none p-0">
    {#each roster as villager (villager.id)}
      <VillagerRecord
        anchorId="{groupId}-{place}-{villager.id}"
        birthdaySoon={urgent}
        hidden={!matchingVillagers.has(villager.id)}
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
    {@const count = list.filter(({ id }) => matchingVillagers.has(id)).length}
    <section
      aria-labelledby="{groupId}-{key}"
      class="border-rule-faint border-t"
      hidden={count === 0}
    >
      <div class="place-head">
        <h3 id="{groupId}-{key}" class:taped={urgent} class="font-body text-xl">{title}</h3>
        <ShelfHeading class="running-shelf" shelf="todo" level={4} explains={false} {count} />
      </div>
      {@render rows(list, key, urgent)}
    </section>
  {/if}
{/snippet}

{#if groupRows.length > 0}
  <GroupSection
    id={groupId}
    {name}
    {completed}
    findable
    placeGroup
    visible={matchCount > 0}
    revealTarget={anchor === groupId ? anchor : ""}
  >
    {#snippet icon()}<Icon.Category category="villagers" class="size-4 shrink-0" />{/snippet}
    {#snippet count()}
      <span class="font-data text-sm font-normal text-muted-foreground"
        >{formatNumber(matchCount, locale)}</span
      >
    {/snippet}

    {#if completed}
      {@render rows(finished, "completed")}
    {:else}
      {@render place("Birthdays this week", birthdays, "birthdays", true)}
      {@render place("Hearts to go", heartsToGo, "hearts")}
      {@render place("Relationships", relationships, "relationships")}
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
