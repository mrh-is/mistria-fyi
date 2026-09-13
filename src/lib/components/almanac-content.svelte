<script lang="ts">
  import { onDestroy } from "svelte";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";

  import ConfirmSpoilerDialog from "$lib/components/confirm-spoiler-dialog.svelte";
  import DatesSection from "$lib/components/dates-section.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import TrackerRowStack from "$lib/components/tracker-row-stack.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { trackerData, trackerIndex } from "$lib/data/index.js";
  import { isItemDimmed, isRowVisible, shouldCountItem } from "$lib/engine/availability.js";
  import { isEntityNameVisible, isVisible } from "$lib/engine/visibility.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordEntries, recordValues } from "$lib/utils";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";
  import { registerSourceFilters } from "$lib/utils/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "$lib/utils/spoiler-guard.svelte.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import AllCompleted from "./all-completed.svelte";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { Source } from "$lib/types/acquisition";
  import type { AlmanacEntry, ItemId } from "$lib/types/tracker-data.js";
  import type { VisibilityCondition } from "$lib/types/visibility.js";

  const spoilerGuard = createSpoilerGuard();

  function isItemCompleted(itemId: ItemId): boolean {
    return userState.state.completed.almanac.has(itemId);
  }

  function itemNameVisible(item: { visibility?: VisibilityCondition }): boolean {
    return isEntityNameVisible(item.visibility, userState.progressionState);
  }

  function aggregateSources(entry: AlmanacEntry): Source[] {
    return trackerIndex.getAggregatedAlmanacSources(entry.itemIds[0]);
  }

  function rowDisplay(
    itemId: ItemId,
    item: { visibility?: VisibilityCondition },
    sources: Source[],
  ): TrackerRowDisplay {
    const completed = isItemCompleted(itemId);
    if (!itemNameVisible(item)) return { mode: "spoilered" };
    if (completed) return { leaving: recentlyCompleted.has(itemId), mode: "completed" };
    return {
      dimmed: isItemDimmed(
        sources,
        completed,
        userState.state.worldState,
        userState.state.availabilityMode,
      ),
      mode: "visible",
    };
  }

  let redactedStoreIds = $derived(
    new Set(
      recordEntries(trackerData.stores)
        .filter(
          ([, { visibility }]) => visibility && !isVisible(visibility, userState.progressionState),
        )
        .map(([id]) => id),
    ),
  );

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds));

  let recentlyCompleted = new SvelteSet<ItemId>();

  function markLeaving(itemId: ItemId): void {
    recentlyCompleted.add(itemId);
    setTimeout(() => recentlyCompleted.delete(itemId), 1050);
  }

  function isAlmanacComplete(): boolean {
    return (
      recordValues(trackerData.almanac).every((cat) =>
        cat.items.every((entry) => isItemCompleted(entry.itemIds[0])),
      ) && userState.state.completed.dates.size === recordValues(trackerData.dates).length
    );
  }

  function checkCelebration(canonicalIds: ItemId[]): void {
    if (isAlmanacComplete()) {
      celebrateCategory();
    } else if (canonicalIds.every((id) => isItemCompleted(id))) {
      celebrate();
    }
  }

  const SECTION_LIMIT = 50;
  const SECTION_BATCH_SIZE = 12;

  let expandedSections = $state<Record<string, boolean>>({});
  let openSections = $state<Record<string, boolean>>({});
  let renderedSectionCounts = $state<Record<string, number>>({});
  const sectionFrames = new SvelteMap<string, number>();

  let nameFilter = $derived(toolbarState.searchQuery);

  registerSourceFilters("almanac", () => trackerIndex.categorySourceTypes.almanac);

  onDestroy(() => {
    for (const frame of sectionFrames.values()) {
      cancelAnimationFrame(frame);
    }
    sectionFrames.clear();
  });

  function stopSectionRendering(sectionId: string): void {
    const frame = sectionFrames.get(sectionId);
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      sectionFrames.delete(sectionId);
    }
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

  function matchesFilter(name: string): boolean {
    if (!nameFilter) return true;
    return name.toLowerCase().includes(nameFilter.toLowerCase());
  }

  function toggleItem(canonicalId: ItemId, entry: AlmanacEntry, catCanonicalIds: ItemId[]): void {
    userState.toggleAlmanacItem(canonicalId);
    const completed = isItemCompleted(canonicalId);
    showUndoToast(entry.name, completed, () => {
      userState.toggleAlmanacItem(canonicalId);
    });
    if (completed) {
      if (!userState.state.showCompleted) markLeaving(canonicalId);
      checkCelebration(catCanonicalIds);
    }
  }
</script>

{#if spoilerGuard.condition}
  <ConfirmSpoilerDialog
    condition={spoilerGuard.condition}
    bind:open={spoilerGuard.open}
    onCancel={() => {
      spoilerGuard.cancel();
    }}
    onComplete={() => {
      spoilerGuard.complete();
    }}
    onCompleteAndUpdate={() => {
      spoilerGuard.completeAndUpdate();
    }}
  />
{/if}

{#each recordEntries(trackerData.almanac) as [id, cat] (id)}
  {@const catCanonicalIds = cat.items.map((entry) => entry.itemIds[0])}
  {@const catEntries = cat.items
    .map((entry) => {
      const canonicalId = entry.itemIds[0];
      const item = trackerData.items[canonicalId];
      return { canonicalId, entry, item };
    })
    .sort((a, b) => a.entry.name.localeCompare(b.entry.name))}
  {@const baseItems = catEntries.filter(({ canonicalId, entry }) => {
    if (!matchesFilter(entry.name)) return false;
    const sources = aggregateSources(entry);
    return shouldCountItem(
      sources,
      isItemCompleted(canonicalId),
      userState.state.worldState,
      userState.state.availabilityMode,
    );
  })}
  {@const scopedItems = baseItems.filter(({ entry }) =>
    toolbarState.matchesSourceFilters(aggregateSources(entry)),
  )}
  {@const filteredItems = scopedItems.filter(({ canonicalId }) =>
    isRowVisible(
      canonicalId,
      isItemCompleted(canonicalId),
      userState.state.showCompleted,
      recentlyCompleted,
    ),
  )}
  {#if baseItems.length > 0}
    {@const showAll = expandedSections[id] ?? false}
    {@const isOpen = openSections[id] ?? false}
    {@const renderTarget = showAll
      ? filteredItems.length
      : Math.min(filteredItems.length, SECTION_LIMIT)}
    {@const shouldBypassBatching =
      isOpen && !sectionFrames.has(id) && (renderedSectionCounts[id] ?? 0) < renderTarget}
    {@const renderedCount =
      nameFilter || shouldBypassBatching
        ? renderTarget
        : Math.min(renderedSectionCounts[id] ?? renderTarget, renderTarget)}
    {@const displayItems = filteredItems.slice(0, renderedCount)}
    <ExpandableSection
      count={scopedItems.filter(({ canonicalId }) => isItemCompleted(canonicalId)).length}
      forceOpen={!!nameFilter}
      name={cat.name}
      onExpandedChange={(open: boolean) => {
        setSectionOpen(
          id,
          open,
          expandedSections[id]
            ? filteredItems.length
            : Math.min(filteredItems.length, SECTION_LIMIT),
        );
      }}
      reportCategory="almanac"
      reportEntityId={id}
      total={scopedItems.length}
    >
      <TrackerRowStack>
        {#each displayItems as { canonicalId, entry, item } (canonicalId)}
          {@const itemCompleted = isItemCompleted(canonicalId)}
          {@const itemSources = aggregateSources(entry)}
          {@const itemVisibility = item.visibility}
          <TrackerRow
            display={rowDisplay(canonicalId, { visibility: itemVisibility }, itemSources)}
            lookups={{ ...baseLookups, entityVisibility: itemVisibility }}
            name={entry.name}
            reportCategory="almanac item"
            reportEntityId={canonicalId}
            sources={itemSources}
            sprite={item.iconSprite}
            spriteClass="text-cat-almanac"
            onToggle={() => {
              if (itemNameVisible({ visibility: itemVisibility }) || itemCompleted) {
                toggleItem(canonicalId, entry, catCanonicalIds);
              } else {
                spoilerGuard.guard(itemVisibility, () => {
                  toggleItem(canonicalId, entry, catCanonicalIds);
                });
              }
            }}
          />
        {/each}
      </TrackerRowStack>
      {#if filteredItems.length === 0}
        <p class="py-4 text-center text-sm text-muted-foreground">
          No items match the current filters
        </p>
      {:else if !nameFilter && renderedCount === 0}
        <p class="py-4 text-center text-sm text-muted-foreground">Loading items…</p>
      {/if}
      {#if !showAll && filteredItems.length > SECTION_LIMIT}
        <div class="flex justify-center py-1">
          <Button
            class="h-7 text-sm text-muted-foreground"
            variant="ghost"
            onclick={() => {
              expandedSections[id] = true;
              if (openSections[id]) {
                scheduleSectionRendering(id, filteredItems.length);
              }
            }}
          >
            Show {filteredItems.length - SECTION_LIMIT} more...
          </Button>
        </div>
      {/if}
    </ExpandableSection>
  {/if}
{/each}

<DatesSection
  onAllComplete={() => {
    if (isAlmanacComplete()) celebrateCategory();
    else celebrate();
  }}
/>

<AllCompleted isAllCompleted={isAlmanacComplete()} />
