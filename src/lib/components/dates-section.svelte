<script lang="ts">
  import ConfirmSpoilerDialog from "$lib/components/confirm-spoiler-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { isEntityNameVisible, isVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordEntries } from "$lib/utils";
  import { celebrate } from "$lib/utils/celebrate.js";
  import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";
  import { createSpoilerGuard } from "$lib/utils/spoiler-guard.svelte.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { DateId } from "$lib/types/tracker-data.js";

  const spoilerGuard = createSpoilerGuard();

  const categoryVisible = $derived(
    isVisible(trackerData.categoryVisibility.dates, userState.progressionState),
  );

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

  function dateNameVisible(dateId: DateId): boolean {
    const visibility = trackerData.dates[dateId].visibility;
    return isEntityNameVisible(visibility, userState.progressionState);
  }

  function rowDisplay(dateId: DateId, completed: boolean): TrackerRowDisplay {
    if (!dateNameVisible(dateId)) return { mode: "spoilered" };
    return completed ? { mode: "completed" } : { mode: "visible" };
  }

  function toggleDate(dateId: DateId): void {
    const vis = trackerData.dates[dateId].visibility;
    if (!dateNameVisible(dateId)) {
      spoilerGuard.guard(vis, () => {
        toggleDate(dateId);
      });
      return;
    }

    userState.toggleDate(dateId);
    const completed = userState.state.completed.dates.has(dateId);
    const date = trackerData.dates[dateId];
    showUndoToast(date.name, completed, () => {
      userState.toggleDate(dateId);
    });
    if (completed && allDatesComplete()) {
      celebrate();
    }
  }

  function allDatesComplete(): boolean {
    return Object.keys(trackerData.dates).every((id) =>
      userState.state.completed.dates.has(id as DateId),
    );
  }

  let dates = $derived(
    Object.entries(trackerData.dates)
      .map(([id, date]) => ({ ...date, id: id as DateId }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  let completedCount = $derived(
    dates.filter((d) => userState.state.completed.dates.has(d.id)).length,
  );
</script>

{#if categoryVisible || userState.state.showSpoilers}
  <ExpandableSection name="Dates" count={completedCount} total={dates.length} defaultOpen={false}>
    <div class="flex flex-col gap-0.5">
      {#each dates as date (date.id)}
        {@const completed = userState.state.completed.dates.has(date.id)}
        {#if completed ? userState.state.showCompleted : true}
          <TrackerRow
            name={date.name}
            display={rowDisplay(date.id, completed)}
            sources={date.sources}
            lookups={{ ...baseLookups, entityVisibility: date.visibility }}
            onToggle={() => {
              toggleDate(date.id);
            }}
          />
        {/if}
      {/each}
    </div>
  </ExpandableSection>
{/if}

{#if spoilerGuard.condition}
  <ConfirmSpoilerDialog
    bind:open={spoilerGuard.open}
    condition={spoilerGuard.condition}
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
