<script lang="ts">
  import { onDestroy } from "svelte";
  import { SvelteMap } from "svelte/reactivity";

  import DatesSection from "#lib/components/dates-section.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { createLeavingSet } from "#lib/controllers/leaving-set.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { isItemDimmed, isRowVisible, shouldCountItem } from "#lib/engine/availability.js";
  import { isCategoryComplete } from "#lib/engine/progress.js";
  import { isEntityNameVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { computeRedactedStoreIds } from "#lib/sources/redacted-stores.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { recordEntries } from "#lib/utils/record.js";
  import { sectionRenderTarget, trackerRowDisplay } from "#lib/utils/row-display.js";

  import AllCompleted from "./all-completed.svelte";

  import type { Source } from "#lib/types/acquisition.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { AlmanacEntry, Item, ItemId } from "#lib/types/tracker-data.js";
  import type { VisibilityCondition } from "#lib/types/visibility.js";
  import type { TrackerRowDisplay } from "#lib/utils/row-display.js";

  let { locale }: { locale: LocaleCode } = $props();

  const spoilerGuard = createSpoilerGuard();

  function aggregateSources(entry: AlmanacEntry): Source[] {
    return trackerIndex.getAggregatedAlmanacSources(entry.itemIds[0]);
  }

  function isItemCompleted(itemId: ItemId): boolean {
    return userState.state.completed.almanac.has(itemId);
  }

  function itemNameVisible(item: { visibility?: VisibilityCondition }): boolean {
    return isEntityNameVisible(item.visibility, userState.progressionState);
  }

  function rowDisplay(
    itemId: ItemId,
    item: { visibility?: VisibilityCondition },
    sources: Source[],
  ): TrackerRowDisplay {
    const completed = isItemCompleted(itemId);
    return trackerRowDisplay({
      completed,
      dimmed: isItemDimmed(
        sources,
        completed,
        userState.state.worldState,
        userState.state.availabilityWindows,
      ),
      leaving: recentlyCompleted.has(itemId),
      nameVisible: itemNameVisible(item),
    });
  }

  let redactedStoreIds = $derived(computeRedactedStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds, locale));

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

  interface AlmanacRow {
    canonicalId: ItemId;
    entry: AlmanacEntry;
    item: Item;
    name: string;
  }

  /** Each almanac category's rows, named & sorted for the locale. */
  let almanacSections = $derived(
    recordEntries(trackerData.almanac).map(([id, cat]) => ({
      canonicalIds: cat.items.map((entry) => entry.itemIds[0]),
      id,
      rows: cat.items
        .map((entry): AlmanacRow => {
          const canonicalId = entry.itemIds[0];
          return {
            canonicalId,
            entry,
            item: trackerData.items[canonicalId],
            name: getName("items", canonicalId, locale),
          };
        })
        .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
    })),
  );

  /**
   * Each section's rows narrowed in three steps: `baseRows` (search & availability; the section
   * renders only when non-empty), `scopedRows` (plus source filters; the counter), and
   * `visibleRows` (plus completed-row hiding; what renders).
   */
  let sectionViews = $derived(
    almanacSections.map((section) => {
      const baseRows = section.rows.filter(({ canonicalId, entry, item, name }) => {
        if (!matchesFilter(name)) return false;
        if (nameFilter && !itemNameVisible(item)) return false;
        return shouldCountItem(
          aggregateSources(entry),
          isItemCompleted(canonicalId),
          userState.state.worldState,
          userState.state.availabilityWindows,
        );
      });
      const scopedRows = baseRows.filter(({ entry }) =>
        toolbarState.matchesSourceFilters(aggregateSources(entry)),
      );
      return {
        ...section,
        baseRows,
        completedCount: scopedRows.filter(({ canonicalId }) => isItemCompleted(canonicalId)).length,
        scopedRows,
        visibleRows: scopedRows.filter(({ canonicalId }) =>
          isRowVisible(
            canonicalId,
            isItemCompleted(canonicalId),
            userState.state.showCompleted,
            recentlyCompleted.ids,
          ),
        ),
      };
    }),
  );

  onDestroy(() => {
    for (const frame of sectionFrames.values()) {
      cancelAnimationFrame(frame);
    }
    sectionFrames.clear();
  });

  function matchesFilter(name: string): boolean {
    if (!nameFilter) return true;
    return name.toLowerCase().includes(nameFilter.toLowerCase());
  }

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
      if (!userState.state.showCompleted) recentlyCompleted.mark(canonicalId);
      checkCelebration(catCanonicalIds);
    }
  }
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

{#each sectionViews as { baseRows, canonicalIds, completedCount, id, scopedRows, visibleRows } (id)}
  {#if baseRows.length > 0}
    {@const showAll = expandedSections[id] ?? false}
    {@const isOpen = openSections[id] ?? false}
    {@const renderTarget = sectionRenderTarget(visibleRows.length, showAll)}
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
        setSectionOpen(id, open, sectionRenderTarget(visibleRows.length, showAll));
      }}
      reportCategory="almanac"
      reportEntityId={id}
      total={scopedRows.length}
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
        {#snippet row({ canonicalId, entry, item, name })}
          {@const itemCompleted = isItemCompleted(canonicalId)}
          {@const itemSources = aggregateSources(entry)}
          {@const itemVisibility = item.visibility}
          <TrackerRow
            display={rowDisplay(canonicalId, { visibility: itemVisibility }, itemSources)}
            lookups={{ ...baseLookups, entityVisibility: itemVisibility }}
            {name}
            reportCategory="almanac-item"
            reportEntityId={canonicalId}
            sources={itemSources}
            sprite={canonicalId}
            spriteClass="text-cat-almanac"
            onToggle={() => {
              if (itemNameVisible({ visibility: itemVisibility }) || itemCompleted) {
                toggleItem(canonicalId, name, canonicalIds);
              } else {
                spoilerGuard.guard(itemVisibility, () => {
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

<DatesSection
  {locale}
  onAllComplete={() => {
    if (isAlmanacComplete()) celebrateCategory();
    else celebrate();
  }}
/>

<AllCompleted isAllCompleted={isAlmanacComplete()} />
