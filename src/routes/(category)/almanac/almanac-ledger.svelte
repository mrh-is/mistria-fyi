<script lang="ts">
  import { SvelteURL } from "svelte/reactivity";

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
  import { ledgerPlacement } from "#lib/presentation/ledger.js";
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
  const { snapshot: ledger, visible } = createLedgerPage(
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
  useLedgerArrival(() => (ledger.ready ? hash : ""));

  // Finished sections follow the rest under their own heading, as the index lists them.
  let sections = $derived.by(() => {
    const shown = ledger.value.filter(({ rows }) =>
      rows.some((row) => visible(row) && toolbarState.matchesSourceFilters(row.sources)),
    );
    const finished = ({ progress }: (typeof shown)[number]) => progress.completed >= progress.total;
    return [
      ...shown.filter((section) => !finished(section)),
      ...shown.filter((section) => finished(section)),
    ];
  });
  let firstFinished = $derived(
    sections.findIndex(({ progress }) => progress.completed >= progress.total),
  );
</script>

<SpoilerGuardDialog guard={checkOff.guard} />
<LedgerNotice changed={ledger.needsRefresh} onRefresh={ledger.refresh} />
<LedgerIndex {sections}>
  {#each sections as { id, name, rows, canonicalIds, progress }, index (id)}
    {#if index === firstFinished}
      <ShelfHeading class="finished-sections" shelf="completed" explains={false} level={2} />
    {/if}
    <LedgerSection
      {id}
      {locale}
      {name}
      {progress}
      {rows}
      {visible}
      explains={index === 0}
      divider={index > 0 && index !== firstFinished}
      forceOpen={hash === id}
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

<style>
  /* Set apart from the last open section by the same gap a sprig divider takes. */
  :global(.finished-sections) {
    margin-block: 3rem 0.5rem;
    padding-block-start: 0.75rem;
    border-block-start: 1px dashed var(--color-rule);
  }
</style>
