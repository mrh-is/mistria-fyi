<script lang="ts">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { isEntityNameVisible, isVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { celebrate } from "#lib/utils/celebrate.js";
  import { computeRedactedStoreIds } from "#lib/utils/redacted-stores.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";
  import { buildBaseSegmentLookups } from "#lib/utils/segment-lookups.js";
  import { registerSourceFilters } from "#lib/utils/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/utils/spoiler-guard.svelte.js";
  import { showUndoToast } from "#lib/utils/undo-toast.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { DateId } from "#lib/types/tracker-data.js";

  let { locale, onAllComplete = celebrate }: { locale: LocaleCode; onAllComplete?: () => void } =
    $props();

  const spoilerGuard = createSpoilerGuard();

  const categoryVisible = $derived(
    isVisible(trackerData.categoryVisibility.dates, userState.progressionState),
  );

  let redactedStoreIds = $derived(computeRedactedStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds, locale));

  function allDatesComplete(): boolean {
    return Object.keys(trackerData.dates).every((id) =>
      userState.state.completed.dates.has(id as DateId),
    );
  }

  function dateNameVisible(dateId: DateId): boolean {
    const visibility = trackerData.dates[dateId].visibility;
    return isEntityNameVisible(visibility, userState.progressionState);
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
    showUndoToast(getName("dates", dateId, locale), completed, () => {
      userState.toggleDate(dateId);
    });
    if (completed && allDatesComplete()) {
      onAllComplete();
    }
  }

  let dates = $derived(
    Object.entries(trackerData.dates)
      .map(([id, date]) => ({
        ...date,
        id: id as DateId,
        name: getName("dates", id as DateId, locale),
      }))
      .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
  );

  registerSourceFilters("dates", () => trackerIndex.categorySourceTypes.dates);

  let scopedDates = $derived(
    dates.filter(({ sources }) => toolbarState.matchesSourceFilters(sources)),
  );

  let completedCount = $derived(
    scopedDates.filter((date) => userState.state.completed.dates.has(date.id)).length,
  );

  let visibleDates = $derived(
    scopedDates.filter((date) => {
      const completed = userState.state.completed.dates.has(date.id);
      return completed ? userState.state.showCompleted : true;
    }),
  );
</script>

{#if categoryVisible || userState.state.showSpoilers}
  <ExpandableSection
    name={m.dates_section_name()}
    reportCategory="dates"
    count={completedCount}
    total={scopedDates.length}
    defaultOpen={false}
  >
    <div class="flex flex-col gap-0.5">
      <TrackerRowList getKey={(date) => date.id} items={visibleDates}>
        {#snippet row(date)}
          {@const completed = userState.state.completed.dates.has(date.id)}
          <TrackerRow
            name={date.name}
            reportCategory="date"
            reportEntityId={date.id}
            display={trackerRowDisplay({ completed, nameVisible: dateNameVisible(date.id) })}
            sources={date.sources}
            lookups={{ ...baseLookups, entityVisibility: date.visibility }}
            onToggle={() => {
              toggleDate(date.id);
            }}
          />
        {/snippet}
      </TrackerRowList>
    </div>
  </ExpandableSection>
{/if}

<SpoilerGuardDialog guard={spoilerGuard} />
