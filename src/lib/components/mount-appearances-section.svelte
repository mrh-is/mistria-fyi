<script lang="ts">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import ShelfRows from "#lib/components/shelf-rows.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { pageShelfFacts, registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { getSectionGroupItem } from "#lib/controllers/section-grouping.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showUndoToast } from "#lib/effects/undo-toast.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { countShelfRows, filteredCounts, rowShelf } from "#lib/engine/shelves.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { recordEntries } from "#lib/utils/record.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type {
    MountAppearance,
    MountAppearanceId,
    MountPerk,
    PerkId,
  } from "#lib/types/tracker-data.js";

  /** The Mount section lists the Mistmare's appearances, then the perks the Horse Statue sells. */
  type MountEntry = (
    | (MountAppearance & { id: MountAppearanceId; kind: "appearance" })
    | (MountPerk & { id: PerkId; kind: "perk" })
  ) & { name: string };

  let {
    areAllAnimalsComplete,
    locale,
  }: { areAllAnimalsComplete: () => boolean; locale: LocaleCode } = $props();

  const sectionGroupItem = getSectionGroupItem();
  const spoilerGuard = createSpoilerGuard();

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));

  let entries: MountEntry[] = $derived([
    ...recordEntries(trackerData.mount.appearances)
      .map(([id, appearance]) => ({
        ...appearance,
        id,
        kind: "appearance" as const,
        name: getName("mount", id, locale),
      }))
      .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
    ...recordEntries(trackerData.mount.perks)
      .map(([id, perk]) => ({
        ...perk,
        id,
        kind: "perk" as const,
        name: getName("perks", id, locale),
      }))
      .toSorted((a, b) => nameCollator(locale).compare(a.name, b.name)),
  ]);

  let nameFilter = $derived(toolbarState.searchQuery);

  let shelvedEntries = $derived(
    entries.map((entry) => ({ ...entry, ...pageShelfFacts(entry, isCompleted(entry)) })),
  );

  let namedEntries = $derived(
    nameFilter
      ? shelvedEntries.filter(
          ({ name, visibility }) =>
            isConditionVisible(visibility, userState.progressionState) &&
            matchesName(name, nameFilter, locale),
        )
      : shelvedEntries,
  );

  let progress = $derived(countShelfRows(shelvedEntries));

  let visibleEntries = $derived(namedEntries.filter(({ shown }) => shown));

  registerPageSearch(() => ({
    filtered: filteredCounts(namedEntries),
    visible: visibleEntries.length,
  }));

  function isCompleted(entry: MountEntry): boolean {
    return entry.kind === "appearance"
      ? userState.state.progress.mountAppearances.has(entry.id)
      : userState.state.progress.unlockedPerks.has(entry.id);
  }

  function toggleCompleted(entry: MountEntry): void {
    if (entry.kind === "appearance") userState.toggleMountAppearance(entry.id);
    else userState.togglePerk(entry.id);
  }

  function isMountComplete(): boolean {
    return entries.every((entry) => isCompleted(entry));
  }

  function toggleEntry(entry: MountEntry): void {
    sectionGroupItem?.hold();
    toggleCompleted(entry);
    const completed = isCompleted(entry);
    showUndoToast(entry.name, completed, () => {
      toggleCompleted(entry);
    });
    if (completed && isMountComplete() && areAllAnimalsComplete()) {
      celebrateCategory();
    } else if (completed && isMountComplete()) {
      celebrate();
    }
  }
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

{#if !nameFilter || visibleEntries.length > 0}
  <ExpandableSection
    {locale}
    forceOpen={!!nameFilter}
    name={getName("ui", "mount", locale)}
    {progress}
    reportCategory="mount-appearances"
  >
    {#each [{ kind: "appearance", name: m.animals_mount_appearances() }, { kind: "perk", name: m.animals_mount_perks() }] as group (group.kind)}
      {@const groupProgress = countShelfRows(
        shelvedEntries.filter((entry) => entry.kind === group.kind),
      )}
      {@const visibleGroupEntries = visibleEntries.filter((entry) => entry.kind === group.kind)}
      {#if visibleGroupEntries.length > 0}
        <ExpandableSection
          {locale}
          depth={1}
          forceOpen={!!nameFilter}
          name={group.name}
          progress={groupProgress}
        >
          <ShelfRows
            forceOpen={!!nameFilter}
            level={4}
            getKey={(entry) => `${entry.kind}:${entry.id}`}
            getShelf={rowShelf}
            items={visibleGroupEntries}
          >
            {#snippet row(entry)}
              {@const completed = isCompleted(entry)}
              {@const spoilered = !isConditionVisible(entry.visibility, userState.progressionState)}
              <TrackerRow
                fact={factKey(
                  entry.kind === "appearance" ? "mountAppearances" : "unlockedPerks",
                  entry.id,
                )}
                display={trackerRowDisplay({ completed, spoilered })}
                segmentLookups={{ ...baseLookups, entityVisibility: entry.visibility }}
                name={entry.name}
                reportCategory={entry.kind === "appearance" ? "mount-appearance" : "mount-perk"}
                reportEntityId={entry.id}
                sources={entry.sources}
                onToggle={() => {
                  if (!spoilered || completed) {
                    toggleEntry(entry);
                  } else {
                    spoilerGuard.requestGuardedAction(entry.visibility, () => {
                      toggleEntry(entry);
                    });
                  }
                }}
              />
            {/snippet}
          </ShelfRows>
        </ExpandableSection>
      {/if}
    {/each}
  </ExpandableSection>
{/if}
