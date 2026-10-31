<script lang="ts">
  import { untrack } from "svelte";

  import CompletedHeading from "#lib/components/completed-heading.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import { Icon } from "#lib/components/icon/index.js";
  import MineFloorRecord from "#lib/components/mine-floor-record.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import SpoilerSection from "#lib/components/spoiler-section.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { createLeavingSet } from "#lib/controllers/leaving-set.svelte.js";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { buildSourceChecklist } from "#lib/controllers/source-checklist.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { categoryForKey } from "#lib/data/categories.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showQuestToast, showUndoToast } from "#lib/effects/undo-toast.js";
  import { getAllProgress, isCategoryComplete } from "#lib/engine/categories.js";
  import { getMaxMineFloor, getMaxRenownLevel, isVillagerComplete } from "#lib/engine/progress.js";
  import { isSkillComplete } from "#lib/engine/projections/skills.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { projectSourceGroups, SOURCE_TYPE_ORDER } from "#lib/presentation/source-groups.js";
  import {
    compareSourceSections,
    sourceSectionLabel,
    sourceTypeLabel,
  } from "#lib/presentation/source-labels.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { captureFocusFallback } from "#lib/utils/focus-fallback.js";
  import { matchesName, matchesTerms } from "#lib/utils/name-match.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import CategorySection from "./category-section.svelte";
  import GroupSection from "./group-section.svelte";

  import type { SourceChecklistRow } from "#lib/controllers/source-checklist.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { QuestId, SkillId, VillagerId } from "#lib/types/tracker-data.js";

  let { anchor, locale }: { anchor: string; locale: LocaleCode } = $props();

  const guard = createSpoilerGuard();
  const leaving = createLeavingSet<string>();
  const sectionGrouping = createSectionGrouping<string>();
  registerSourceFilters("almanac", () => trackerIndex.categorySourceTypes.almanac);
  let entries = $derived(buildSourceChecklist(userState.progressContext, locale));
  let lookups = $derived(
    buildBaseSegmentLookups(computeSpoileredStoreIds(userState.progressionState), locale),
  );
  let progress = $derived(getAllProgress(userState.progressContext));
  let progressCompletions = $derived([
    userState.state.progress.mineFloor >= getMaxMineFloor(),
    userState.state.progress.renown >= getMaxRenownLevel(),
    ...Object.keys(trackerData.skills).map((id) =>
      isSkillComplete(id as SkillId, userState.state.progress),
    ),
    ...Object.keys(trackerData.villagers).map((id) =>
      isVillagerComplete(id as VillagerId, userState.state.progress),
    ),
  ]);
  let sections = $derived(
    projectSourceGroups(entries, userState.progressContext, (sources) =>
      toolbarState.matchesSourceFilters(sources),
    ),
  );
  let groups = $derived(
    SOURCE_TYPE_ORDER.map((group) => ({
      group,
      sections: sections
        .filter((section) => section.group === group)
        .map((section) => ({
          section,
          ...sourceSectionLabel(section, lookups, userState.progressionState),
          held: sectionGrouping.heldCompletion(section.id),
          visibleRows: section.rows
            .filter(({ entry, window }) => {
              const spoilered =
                entry.spoilered ||
                !isConditionVisible(entry.visibility, userState.progressionState);
              if (toolbarState.searchQuery && (spoilered || !matchesSearch(entry))) {
                return false;
              }
              if (!entry.obtainable && !toolbarState.showUnobtainable) return false;
              if (leaving.has(entry.key)) return true;
              return entry.completed
                ? userState.state.showCompleted
                : userState.state.availabilityWindows.includes(window);
            })
            .toSorted((a, b) => nameCollator(locale).compare(a.entry.name, b.entry.name)),
        }))
        .filter(
          ({ section, spoilered, visibleRows }) =>
            (!toolbarState.searchQuery || (!spoilered && visibleRows.length > 0)) &&
            (section.state !== "done" ||
              userState.state.showCompleted ||
              section.rows.some(({ entry }) => leaving.has(entry.key))),
        )
        .toSorted((a, b) => compareSourceSections(a, b, locale)),
    })).filter(
      ({ group, sections: groupSections }) => group === "progress" || groupSections.length > 0,
    ),
  );
  let hasCompletedContent = $derived(
    progressCompletions.includes(true) ||
      groups.some(({ sections: groupSections }) =>
        groupSections.some((entry) => isInCompletedList(entry)),
      ),
  );

  // The hold starts from the section's current completion, which the grouping needs to know.
  $effect(() => {
    const reports = sections.map(({ id, state }) => [id, state === "done"] as const);
    untrack(() => {
      for (const [id, done] of reports) sectionGrouping.report(id, done);
    });
  });

  // Moving or removing a section blurs whatever it contains.
  let restoreFocus: (() => Promise<void>) | undefined;
  $effect.pre(() => {
    void groups;
    void progressCompletions;
    restoreFocus = captureFocusFallback();
  });
  $effect(() => {
    void groups;
    void progressCompletions;
    const restore = restoreFocus;
    restoreFocus = undefined;
    if (restore) void restore();
  });

  function isInCompletedList({
    held,
    section,
    spoilered,
  }: {
    held: boolean | undefined;
    section: { state: string };
    spoilered: boolean;
  }): boolean {
    return !spoilered && (held ?? section.state === "done");
  }

  function matchesSearch(entry: SourceChecklistRow): boolean {
    const names = [entry.name, ...(entry.searchNames ?? [])];
    const query = toolbarState.searchQuery;
    return (
      names.some((name) => matchesName(name, query, locale)) ||
      matchesTerms(names, entry.searchTerms ?? [], query, locale)
    );
  }

  function toggle(entry: SourceChecklistRow): void {
    const perform = () => {
      const completesSource = sections.some(({ rows }) => {
        const remaining = rows.filter(({ entry: row }) => row.obtainable && !row.completed);
        return remaining.length === 1 && remaining[0].entry.key === entry.key;
      });
      for (const { id, rows } of sections) {
        if (rows.some(({ entry: row }) => row.key === entry.key)) sectionGrouping.hold(id);
      }
      const beforeRecipes = new Set(userState.state.progress.almanacRecipes);
      const undo = entry.toggle();
      const updated = buildSourceChecklist(userState.progressContext, locale).find(
        ({ key }) => key === entry.key,
      );
      if (entry.reportCategory === "quest") {
        const added = [...userState.state.progress.almanacRecipes].filter(
          (id) => !beforeRecipes.has(id),
        );
        showQuestToast(
          entry.name,
          userState.state.progress.questStates[entry.id as QuestId] ?? "none",
          added,
          locale,
          undo,
        );
      } else {
        showUndoToast(entry.name, updated?.completed ?? false, undo);
      }
      if (updated?.completed) {
        if (!userState.state.showCompleted) leaving.markLeaving(entry.key);
        if (isCategoryComplete(entry.category, userState.progressContext)) celebrateCategory();
        else if (completesSource) celebrate();
      }
    };
    if (
      entry.completed ||
      (!entry.spoilered && isConditionVisible(entry.visibility, userState.progressionState))
    ) {
      perform();
    } else {
      guard.requestGuardedAction(entry.visibility, perform);
    }
  }
</script>

<SpoilerGuardDialog {guard} />

{#each userState.state.showCompleted ? [false, true] : [false] as completed (completed)}
  <div
    class="flex flex-col gap-6"
    data-testid={completed ? "everything-completed" : undefined}
    hidden={completed && !hasCompletedContent}
  >
    {#if completed}<CompletedHeading class="px-2 pt-2" />{/if}
    {#each groups as { group, sections: allGroupSections } (group)}
      {@const groupSections = allGroupSections.filter(
        (entry) => completed === isInCompletedList(entry),
      )}
      {@const hasProgress = group === "progress" && progressCompletions.includes(completed)}
      {@const hasOutstanding =
        allGroupSections.some((entry) => !isInCompletedList(entry)) ||
        (group === "progress" && progressCompletions.includes(false))}
      {@const groupId = `sources-${group}${completed && hasOutstanding ? "-completed" : ""}`}
      {#if groupSections.length > 0 || hasProgress}
        <GroupSection
          id={groupId}
          name={sourceTypeLabel(group, locale)}
          {completed}
          revealTarget={anchor === groupId ||
          groupSections.some(
            ({ section }) =>
              anchor === section.id || (section.id === "progress" && anchor === "source-progress"),
          )
            ? anchor
            : ""}
        >
          {#snippet icon()}
            <Icon.Source
              type={allGroupSections[0]?.section.source?.type ?? "default"}
              class="size-4 text-muted-foreground"
            />
          {/snippet}

          {#each groupSections as { section, name, spoilered, visibleRows } (section.id)}
            <div
              id={section.id === "progress" ? "source-progress" : section.id}
              class="scroll-mt-32"
              data-source-section
              data-source-status={spoilered ? undefined : section.state}
            >
              <SpoilerSection {name} {spoilered}>
                <ExpandableSection
                  {locale}
                  depth={1}
                  count={section.completed}
                  total={section.total}
                  forceOpen={anchor === section.id ||
                    (section.id === "progress" && anchor === "source-progress") ||
                    !!toolbarState.searchQuery}
                  name={m.everything_source_heading({
                    name,
                    state:
                      section.state === "done"
                        ? m.everything_source_done()
                        : section.state === "now"
                          ? m.availability_now()
                          : m.availability_later(),
                  })}
                >
                  <TrackerRowList getKey={({ entry }) => entry.key} items={visibleRows}>
                    {#snippet row({ entry, sources, window })}
                      {@const spoileredRow =
                        entry.spoilered ||
                        !isConditionVisible(entry.visibility, userState.progressionState)}
                      <TrackerRow
                        category={entry.category}
                        fact={entry.fact}
                        display={entry.questState === "obtained" && !spoileredRow
                          ? { mode: "obtained" }
                          : trackerRowDisplay({
                              completed: entry.completed,
                              spoilered: spoileredRow,
                              leaving: leaving.has(entry.key),
                              dimmed:
                                !entry.completed &&
                                window === "later" &&
                                userState.state.availabilityWindows.some((w) => w !== "later"),
                            })}
                        name={entry.name}
                        subtitle={[categoryForKey(entry.category, locale).name, entry.subtitle]
                          .filter(Boolean)
                          .join(" · ")}
                        reportCategory={entry.reportCategory}
                        reportEntityId={entry.id}
                        sprite={entry.sprite}
                        spriteClass="text-primary"
                        {sources}
                        segmentLookups={{ ...lookups, entityVisibility: entry.visibility }}
                        onToggle={() => toggle(entry)}
                      />
                    {/snippet}
                  </TrackerRowList>
                </ExpandableSection>
              </SpoilerSection>
            </div>
          {/each}

          {#if group === "progress"}
            <div class="mt-2 flex flex-col gap-6">
              {#if completed === userState.state.progress.mineFloor >= getMaxMineFloor()}
                <MineFloorRecord
                  compact
                  biomes={trackerData.mines.biomes}
                  floor={userState.state.progress.mineFloor}
                  {locale}
                  onChange={(floor) => userState.setMineFloor(floor)}
                />
              {/if}
              {#each ["skills", "renown", "villagers"] as const as category (category)}
                <CategorySection
                  key={category}
                  {locale}
                  progress={progress[category]}
                  {completed}
                />
              {/each}
            </div>
          {/if}
        </GroupSection>
      {/if}
    {/each}
  </div>
{/each}
