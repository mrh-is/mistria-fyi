<script lang="ts">
  import { onDestroy } from "svelte";
  import { SvelteMap } from "svelte/reactivity";

  import AllCompleted from "#lib/components/all-completed.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { createLeavingSet } from "#lib/controllers/leaving-set.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerIndex } from "#lib/data/index.js";
  import { getAlmanacEntryNames, getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { projectAlmanac } from "#lib/engine/projections/almanac.js";
  import * as m from "#lib/paraglide/messages.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { sectionRowLimit, trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { AlmanacRow } from "#lib/engine/projections/almanac.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { ItemId } from "#lib/types/tracker-data.js";
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

  const SECTION_BATCH_SIZE = 12;

  const expandedSections = $state<Record<string, boolean>>({});
  const openSections = $state<Record<string, boolean>>({});
  const renderedSectionCounts = $state<Record<string, number>>({});
  const sectionFrames = new SvelteMap<string, number>();

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

  onDestroy(() => {
    for (const frame of sectionFrames.values()) {
      cancelAnimationFrame(frame);
    }
    sectionFrames.clear();
  });

  function scheduleSectionRendering(sectionId: string, targetCount: number): void {
    stopSectionRendering(sectionId);
    renderedSectionCounts[sectionId] = 0;

    if (targetCount <= 0) return;

    const renderNextBatch = (): void => {
      const nextCount = Math.min(
        (renderedSectionCounts[sectionId] ?? 0) + SECTION_BATCH_SIZE,
        targetCount,
      );
      renderedSectionCounts[sectionId] = nextCount;
      if (nextCount < targetCount) {
        sectionFrames.set(sectionId, requestAnimationFrame(renderNextBatch));
      } else {
        sectionFrames.delete(sectionId);
      }
    };

    sectionFrames.set(sectionId, requestAnimationFrame(renderNextBatch));
  }

  function setSectionOpen(sectionId: string, open: boolean, targetCount: number): void {
    openSections[sectionId] = open;
    if (!open) {
      stopSectionRendering(sectionId);
      renderedSectionCounts[sectionId] = 0;
      return;
    }
    scheduleSectionRendering(sectionId, targetCount);
  }

  function stopSectionRendering(sectionId: string): void {
    const frame = sectionFrames.get(sectionId);
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      sectionFrames.delete(sectionId);
    }
  }

  function toggleItem(canonicalId: ItemId, name: string, catCanonicalIds: ItemId[]): void {
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

{#each sectionViews as { baseRows, canonicalIds, completedCount, id, scopedTotal, visibleRows } (id)}
  {#if baseRows.length > 0}
    {@const showAll = expandedSections[id] ?? false}
    {@const isOpen = openSections[id] ?? false}
    {@const renderTarget = sectionRowLimit(visibleRows.length, showAll)}
    {@const shouldBypassBatching =
      isOpen && !sectionFrames.has(id) && (renderedSectionCounts[id] ?? 0) < renderTarget}
    {@const renderedCount =
      nameFilter || shouldBypassBatching
        ? renderTarget
        : Math.min(renderedSectionCounts[id] ?? renderTarget, renderTarget)}
    <ExpandableSection
      {locale}
      count={completedCount}
      forceOpen={!!nameFilter}
      name={getName("ui", id, locale)}
      onExpandedChange={(open: boolean) => {
        setSectionOpen(id, open, sectionRowLimit(visibleRows.length, showAll));
      }}
      reportCategory="almanac"
      reportEntityId={id}
      total={scopedTotal}
    >
      <TrackerRowList
        expanded={showAll}
        getKey={(item) => item.canonicalId}
        items={visibleRows}
        limited
        loadingMessage={nameFilter ? undefined : m.almanac_loading_items()}
        onShowMore={() => {
          expandedSections[id] = true;
          if (openSections[id]) {
            scheduleSectionRendering(id, visibleRows.length);
          }
        }}
        {renderedCount}
      >
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
                toggleItem(canonicalId, name, canonicalIds);
              } else {
                spoilerGuard.requestGuardedAction(itemVisibility, () => {
                  toggleItem(canonicalId, name, canonicalIds);
                });
              }
            }}
          />
        {/snippet}
      </TrackerRowList>
    </ExpandableSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isAlmanacComplete()} />
