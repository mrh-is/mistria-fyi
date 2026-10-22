<script lang="ts">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { getSectionGroupItem } from "#lib/controllers/section-grouping.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { MountAppearance, MountAppearanceId } from "#lib/types/tracker-data.js";

  type AppearanceEntry = MountAppearance & { id: MountAppearanceId; name: string };

  let {
    areAllAnimalsComplete,
    locale,
  }: { areAllAnimalsComplete: () => boolean; locale: LocaleCode } = $props();

  const sectionGroupItem = getSectionGroupItem();
  const spoilerGuard = createSpoilerGuard();

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));

  let entries: AppearanceEntry[] = $derived(
    Object.entries(trackerData.mount.appearances)
      .map(([id, appearance]) => ({
        ...appearance,
        id: id as MountAppearanceId,
        name: getName("mount", id as MountAppearanceId, locale),
      }))
      .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
  );

  let scopedEntries = $derived(
    entries.filter(({ sources }) => toolbarState.matchesSourceFilters(sources)),
  );

  let completedCount = $derived(
    scopedEntries.filter((entry) => userState.state.progress.mountAppearances.has(entry.id)).length,
  );

  let visibleEntries = $derived(
    scopedEntries.filter((entry) =>
      userState.state.progress.mountAppearances.has(entry.id)
        ? userState.state.showCompleted
        : true,
    ),
  );

  function isMountComplete(): boolean {
    return entries.every((entry) => userState.state.progress.mountAppearances.has(entry.id));
  }

  function toggleAppearance(entry: AppearanceEntry): void {
    sectionGroupItem?.hold();
    userState.toggleMountAppearance(entry.id);
    const completed = userState.state.progress.mountAppearances.has(entry.id);
    showUndoToast(entry.name, completed, () => {
      userState.toggleMountAppearance(entry.id);
    });
    if (completed && isMountComplete() && areAllAnimalsComplete()) {
      celebrateCategory();
    } else if (completed && isMountComplete()) {
      celebrate();
    }
  }
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

{#if visibleEntries.length > 0}
  <ExpandableSection
    {locale}
    count={completedCount}
    name={getName("ui", "mount", locale)}
    reportCategory="mount-appearances"
    total={scopedEntries.length}
  >
    <TrackerRowList getKey={(entry) => entry.id} items={visibleEntries}>
      {#snippet row(entry)}
        {@const completed = userState.state.progress.mountAppearances.has(entry.id)}
        {@const spoilered = !isConditionVisible(entry.visibility, userState.progressionState)}
        <TrackerRow
          display={trackerRowDisplay({ completed, spoilered })}
          segmentLookups={{ ...baseLookups, entityVisibility: entry.visibility }}
          name={entry.name}
          reportCategory="mount-appearance"
          reportEntityId={entry.id}
          sources={entry.sources}
          onToggle={() => {
            if (!spoilered || completed) {
              toggleAppearance(entry);
            } else {
              spoilerGuard.requestGuardedAction(entry.visibility, () => {
                toggleAppearance(entry);
              });
            }
          }}
        />
      {/snippet}
    </TrackerRowList>
  </ExpandableSection>
{:else if toolbarState.isSourceFilterNarrowing}
  <TrackerEmptyState />
{/if}
