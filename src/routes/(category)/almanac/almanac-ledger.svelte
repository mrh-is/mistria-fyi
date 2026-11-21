<script lang="ts">
  import { untrack } from "svelte";
  import { MediaQuery, SvelteSet, SvelteURL } from "svelte/reactivity";

  import AllCompleted from "#lib/components/all-completed.svelte";
  import LedgerIndex from "#lib/components/ledger/ledger-index.svelte";
  import LedgerNotice from "#lib/components/ledger/ledger-notice.svelte";
  import LedgerRow from "#lib/components/ledger/ledger-row.svelte";
  import LedgerSection from "#lib/components/ledger/ledger-section.svelte";
  import ShelfHeading from "#lib/components/shelf-heading.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import { createCheckOff } from "#lib/controllers/check-off.svelte.js";
  import { createLedgerPage, useLedgerArrival } from "#lib/controllers/ledger-page.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { trackerIndex } from "#lib/data/index.js";
  import { getAlmanacEntryVariant } from "#lib/data/item-variants.js";
  import { getAlmanacEntryNames, getName, nameCollator } from "#lib/data/names.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { projectAlmanac } from "#lib/engine/projections/almanac.js";
  import { factKey } from "#lib/engine/provenance.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { ledgerPlacement } from "#lib/presentation/ledger.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { matchesName, matchesTerms } from "#lib/utils/name-match.js";
  import { building } from "$app/env";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { AlmanacCategoryId, ItemId } from "#lib/types/tracker-data.js";

  let { locale }: { locale: LocaleCode } = $props();

  /*
   * The sections the reader opened from their one-line entries. They're kept in the history
   * entry's state, so Back returns to the page as it was left and a fresh visit starts with none.
   */
  const opened = new SvelteSet<string>(untrack(() => page.state.almanacOpened ?? []));
  // Phones open on the list of sections, as production & round 10 do; a tap opens one in place.
  const phone = new MediaQuery("max-width: 47.99rem", false);

  registerSourceFilters("almanac", () => trackerIndex.categorySourceTypes.almanac);

  function isCompleted(id: ItemId): boolean {
    return userState.state.progress.almanac.has(id);
  }

  const checkOff = createCheckOff<ItemId, AlmanacCategoryId>({
    animateLeaving: false,
    category: "almanac",
    grouping: { hold: () => undefined },
    isCompleted,
    toggle: (id) => {
      userState.toggleAlmanacItem(id);
    },
  });

  let lookups = $derived(
    buildBaseSegmentLookups(computeSpoileredStoreIds(userState.progressionState), locale),
  );
  const {
    restoringScroll,
    snapshot: ledger,
    visible,
  } = createLedgerPage(
    () => locale,
    () => {
      const context = userState.progressContext;
      const visibility = context.progressionState;
      return projectAlmanac(context, { progressionState: visibility }).sections.map((section) => ({
        canonicalIds: section.canonicalIds,
        id: section.id,
        name: getName("ui", section.id, locale),
        progress: section.progress,
        rows: section.rows
          .map((row) => {
            const names = getAlmanacEntryNames(row.entry, locale);
            return {
              ...ledgerPlacement(row.sources, context, visibility, row),
              key: row.canonicalId,
              name: names[0],
              names,
              obtainable: row.obtainable,
              variant: getAlmanacEntryVariant(row.entry, locale),
              visibility: row.item.visibility,
            };
          })
          .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
      }));
    },
    (row) => {
      const query = toolbarState.searchQuery;
      return (
        row.names.some((name) => matchesName(name, query, locale)) ||
        matchesTerms(row.names, row.variant ? [row.variant] : [], query, locale)
      );
    },
  );

  let hash = $derived(building ? "" : new SvelteURL(page.url.href).hash.slice(1));
  useLedgerArrival(() => (ledger.ready ? hash : ""), restoringScroll);

  // A link or the jump list opens its section, and it stays open after the link moves on.
  $effect(() => {
    if (hash && ledger.value.some(({ id }) => id === hash)) opened.add(hash);
  });

  // A hash link starts a new history entry, so the set is written again whenever the hash moves.
  $effect(() => {
    const ids = [...opened].toSorted();
    void hash;
    untrack(() => {
      const saved = (page.state.almanacOpened ?? []).toSorted();
      if (ids.join("\n") === saved.join("\n")) return;
      replaceState("", { ...page.state, almanacOpened: ids });
    });
  });

  type Section = (typeof ledger.value)[number];
  const finished = ({ progress }: Section) => progress.completed >= progress.total;
  const shows = ({ rows }: Section) =>
    rows.some((row) => visible(row) && toolbarState.matchesSourceFilters(row.sources));

  // The page's own shelves: To do above, & finished sections on a Completed shelf below.
  let ordered = $derived([
    ...ledger.value.filter((section) => !finished(section)),
    ...ledger.value.filter((section) => finished(section)),
  ]);
  let sections = $derived(ordered.filter((section) => shows(section)));
  // The rail keeps every section, so a search or filter that empties one leaves the page's shape.
  let indexSections = $derived(ordered.map((section) => ({ ...section, muted: !shows(section) })));
  let unfinished = $derived(sections.filter((section) => !finished(section)));
  let completed = $derived(sections.filter((section) => finished(section)));

  function sectionCount(count: number): string {
    const label = formatNumber(count, locale);
    return plural(count, [`${label} section`, `${label} sections`]);
  }
</script>

<SpoilerGuardDialog guard={checkOff.guard} />
<LedgerNotice changed={ledger.needsRefresh} onRefresh={ledger.refresh} />
<LedgerIndex sections={indexSections}>
  {#each ordered as section (section.id)}
    {@const { id, name, rows, canonicalIds, progress } = section}
    {#if id === unfinished[0]?.id}
      <ShelfHeading
        class="running-head"
        shelf="todo"
        note={sectionCount(unfinished.length)}
        level={2}
      />
    {/if}
    {#if id === completed[0]?.id}
      <ShelfHeading
        class="running-head finished-sections"
        shelf="completed"
        note={sectionCount(completed.length)}
        explains={false}
        level={2}
      />
    {/if}
    <LedgerSection
      {id}
      {locale}
      {name}
      {progress}
      {rows}
      {visible}
      divider={id !== unfinished[0]?.id && id !== completed[0]?.id}
      folded={finished(section) || phone.current}
      forceOpen={hash === id}
      bind:open={
        () => opened.has(id) || !(finished(section) || phone.current),
        (value) => {
          if (value) opened.add(id);
          else opened.delete(id);
        }
      }
    >
      {#snippet row(placement, shelf, columns, discovery, highlighted, _active, _onFind, showsRow)}
        {@const { key, name: itemName, variant, visibility } = placement}
        <LedgerRow
          category="almanac"
          {columns}
          completed={isCompleted(key)}
          {discovery}
          fact={factKey("almanac", key)}
          {highlighted}
          id={key}
          lookups={{ ...lookups, entityVisibility: visibility }}
          name={itemName}
          {placement}
          reportCategory="almanac-item"
          {shelf}
          sprite={key}
          subtitle={variant}
          {variant}
          visible={showsRow}
          onToggle={(covered) => {
            checkOff.onToggle(
              {
                id: key,
                name: itemName,
                sectionChecks: [() => canonicalIds.every(isCompleted)],
                sectionKey: id,
                visibility,
              },
              covered,
            );
          }}
        />
      {/snippet}
    </LedgerSection>
  {/each}
</LedgerIndex>
<AllCompleted isAllCompleted={isCategoryComplete("almanac", userState.progressContext)} />

<style>
  /* A running head, “To do · 11 sections”, over each of the page's shelves of sections. */
  :global(.running-head) {
    margin-block-end: 0.25rem;
  }

  :global(.running-head .shelf-heading__note) {
    margin-inline-start: 0;
  }

  :global(.running-head .shelf-heading__note)::before {
    margin-inline: 0.5ch;
    content: "·";
  }

  /* Set apart from the last open section by the same gap a sprig divider takes. */
  :global(.finished-sections) {
    margin-block: 3rem 0.5rem;
    padding-block-start: 0.75rem;
    border-block-start: 1px dashed var(--color-rule);
  }
</style>
