<script lang="ts">
  import { tick } from "svelte";
  import { SvelteURL } from "svelte/reactivity";

  import AllCompleted from "#lib/components/all-completed.svelte";
  import LedgerIndex from "#lib/components/ledger/ledger-index.svelte";
  import LedgerNotice from "#lib/components/ledger/ledger-notice.svelte";
  import LedgerRow from "#lib/components/ledger/ledger-row.svelte";
  import LedgerSection from "#lib/components/ledger/ledger-section.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import { createCheckOff } from "#lib/controllers/check-off.svelte.js";
  import { createLedgerSnapshot } from "#lib/controllers/ledger-snapshot.svelte.js";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { trackerIndex } from "#lib/data/index.js";
  import { getAlmanacEntryVariant } from "#lib/data/item-variants.js";
  import { getAlmanacEntryNames, getName, nameCollator } from "#lib/data/names.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { projectAlmanac } from "#lib/engine/projections/almanac.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { filteredCounts } from "#lib/engine/shelves.js";
  import { ledgerPlacement, ledgerShelf } from "#lib/presentation/ledger.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName, matchesTerms } from "#lib/utils/name-match.js";
  import { building } from "$app/env";
  import { page } from "$app/state";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { AlmanacCategoryId, ItemId } from "#lib/types/tracker-data.js";

  let { locale }: { locale: LocaleCode } = $props();

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
  const ledger = createLedgerSnapshot(
    () => locale,
    () => {
      const context = userState.progressContext;
      const visibility = context.progressionState;
      return projectAlmanac(context, { progressionState: visibility }).sections.map((section) => ({
        canonicalIds: section.canonicalIds,
        id: section.id,
        name: getName("ui", section.id, locale),
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
  );

  let hash = $derived(building ? "" : new SvelteURL(page.url.href).hash.slice(1));
  async function alignSection(id: string): Promise<void> {
    await tick();
    if (hash !== id) return;
    const section = document.getElementById(id);
    section?.scrollIntoView();
    section?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  }

  $effect(() => {
    if (ledger.ready && hash) void alignSection(hash);
  });
  function visible(row: (typeof ledger.value)[number]["rows"][number]): boolean {
    if (!row.obtainable && !toolbarState.showUnobtainable) return false;
    const query = toolbarState.searchQuery;
    if (!query) return true;
    return (
      (!row.spoilered || userState.state.showSpoilers) &&
      (row.names.some((name) => matchesName(name, query, locale)) ||
        matchesTerms(row.names, row.variant ? [row.variant] : [], query, locale))
    );
  }

  let sections = $derived(
    ledger.value.filter(({ rows }) =>
      rows.some((row) => visible(row) && toolbarState.matchesSourceFilters(row.sources)),
    ),
  );

  registerPageSearch(() => {
    const rows = new Map(
      ledger.value.flatMap(({ rows: entries }) =>
        entries.filter((row) => visible(row)).map((row) => [row.key, row]),
      ),
    );
    const matches = [...rows.values()].map((row) => ({
      completed: row.completed,
      doable: ledgerShelf(row, toolbarState.showsSource) === "todo",
      doableAnywhere: row.doable,
      shown: toolbarState.matchesSourceFilters(row.sources),
      sourceDisclosure: { hiddenCount: row.hiddenCount, visibleSources: row.visibleSources },
    }));
    return {
      filtered: filteredCounts(matches),
      visible: matches.filter(({ shown }) => shown).length,
    };
  });
</script>

<SpoilerGuardDialog guard={checkOff.guard} />
<LedgerNotice changed={ledger.needsRefresh} onRefresh={ledger.refresh} />
<LedgerIndex {sections}>
  {#each sections as { id, name, rows, canonicalIds }, index (id)}
    <LedgerSection
      {id}
      {locale}
      {name}
      {rows}
      {visible}
      explains={index === 0}
      forceOpen={hash === id}
      renderRows={ledger.ready}
    >
      {#snippet row(placement, shelf, columns, discovery, highlighted)}
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
