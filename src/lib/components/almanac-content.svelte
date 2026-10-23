<script lang="ts">
  import AllCompleted from "#lib/components/all-completed.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SectionGroups from "#lib/components/section-groups.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { createLeavingSet } from "#lib/controllers/leaving-set.svelte.js";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerIndex } from "#lib/data/index.js";
  import { getAlmanacEntryNames, getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { projectAlmanac } from "#lib/engine/projections/almanac.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { AlmanacRow } from "#lib/engine/projections/almanac.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { AlmanacCategoryId, ItemId } from "#lib/types/tracker-data.js";
  import type { TrackerRowDisplay } from "#lib/utils/row-display.js";

  let { locale }: { locale: LocaleCode } = $props();

  const spoilerGuard = createSpoilerGuard();

  function isItemCompleted(itemId: ItemId): boolean {
    return userState.state.progress.almanac.has(itemId);
  }

  function rowDisplay(row: AlmanacRow): TrackerRowDisplay {
    return trackerRowDisplay({
      completed: row.completed,
      dimmed: row.dimmed,
      leaving: recentlyCompleted.has(row.canonicalId),
      spoilered: row.spoilered,
    });
  }

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));

  const recentlyCompleted = createLeavingSet<ItemId>();
  const sectionGrouping = createSectionGrouping<AlmanacCategoryId>();

  function checkCelebration(canonicalIds: ItemId[]): void {
    if (isAlmanacComplete()) {
      celebrateCategory();
    } else if (canonicalIds.every((id) => isItemCompleted(id))) {
      celebrate();
    }
  }

  function isAlmanacComplete(): boolean {
    return isCategoryComplete("almanac", userState.state);
  }

  let nameFilter = $derived(toolbarState.searchQuery);

  registerSourceFilters("almanac", () => trackerIndex.categorySourceTypes.almanac);

  // Page context includes user filters and the animation's temporary completed-row retention.
  let projection = $derived(
    projectAlmanac(userState.state, {
      hideSpoilered: Boolean(nameFilter),
      matchesEntry: (ids) =>
        getAlmanacEntryNames({ itemIds: ids }, locale).some((name) =>
          matchesName(name, nameFilter, locale),
        ),
      matchesSources: (sources) => toolbarState.matchesSourceFilters(sources),
      progressionState: userState.progressionState,
      recentlyCompleted: recentlyCompleted.ids,
      showCompleted: userState.state.showCompleted,
      showUnobtainable: toolbarState.showUnobtainable,
    }),
  );

  let sectionViews = $derived(
    projection.sections.map((section) => ({
      ...section,
      visibleRows: section.visibleRows
        .map((row) => ({
          ...row,
          name: getAlmanacEntryNames(row.entry, locale)[0],
        }))
        .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
    })),
  );

  function toggleItem(
    canonicalId: ItemId,
    name: string,
    sectionId: AlmanacCategoryId,
    catCanonicalIds: ItemId[],
  ): void {
    sectionGrouping.hold(sectionId);
    userState.toggleAlmanacItem(canonicalId);
    const completed = isItemCompleted(canonicalId);
    showUndoToast(name, completed, () => {
      userState.toggleAlmanacItem(canonicalId);
    });
    if (completed) {
      if (!userState.state.showCompleted) recentlyCompleted.markLeaving(canonicalId);
      checkCelebration(catCanonicalIds);
    }
  }
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

<SectionGroups getKey={(view) => view.id} grouping={sectionGrouping} items={sectionViews}>
  {#snippet section({ baseRows, canonicalIds, completedCount, id, scopedTotal, visibleRows })}
    {#if baseRows.length > 0}
      <ExpandableSection
        {locale}
        count={completedCount}
        forceOpen={!!nameFilter}
        name={getName("ui", id, locale)}
        reportCategory="almanac"
        reportEntityId={id}
        total={scopedTotal}
      >
        <TrackerRowList getKey={(item) => item.canonicalId} items={visibleRows}>
          {#snippet row(row)}
            {@const { canonicalId, completed, item, name, sources, spoilered } = row}
            {@const itemVisibility = item.visibility}
            <TrackerRow
              display={rowDisplay(row)}
              segmentLookups={{ ...baseLookups, entityVisibility: itemVisibility }}
              {name}
              reportCategory="almanac-item"
              reportEntityId={canonicalId}
              {sources}
              sprite={canonicalId}
              spriteClass="text-(--color-category-almanac)"
              onToggle={() => {
                if (!spoilered || completed) {
                  toggleItem(canonicalId, name, id, canonicalIds);
                } else {
                  spoilerGuard.requestGuardedAction(itemVisibility, () => {
                    toggleItem(canonicalId, name, id, canonicalIds);
                  });
                }
              }}
            />
          {/snippet}
        </TrackerRowList>
      </ExpandableSection>
    {/if}
  {/snippet}
</SectionGroups>

<AllCompleted isAllCompleted={isAlmanacComplete()} />
