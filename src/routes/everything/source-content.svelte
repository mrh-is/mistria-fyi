<script lang="ts">
  import { untrack } from "svelte";

  import { Icon } from "#lib/components/icon/index.js";
  import MineFloorRecord from "#lib/components/mine-floor-record.svelte";
  import ShelfFold from "#lib/components/shelf-fold.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import SpoilerSection from "#lib/components/spoiler-section.svelte";
  import TrackerRowSection from "#lib/components/tracker-row-section.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { createRowCheckOff } from "#lib/controllers/check-off.svelte.js";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { buildSourceChecklist } from "#lib/controllers/source-checklist.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { categoryForKey, sortCategoryKeysByName } from "#lib/data/categories.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { nameCollator } from "#lib/data/names.js";
  import { showQuestToast, showUndoToast } from "#lib/effects/undo-toast.js";
  import { getSourceDisclosure } from "#lib/engine/availability.js";
  import { UNSOURCED_CATEGORY_KEYS } from "#lib/engine/categories.js";
  import { getMaxMineFloor, getMaxRenownLevel, isVillagerComplete } from "#lib/engine/progress.js";
  import { sealsBefore } from "#lib/engine/projections/mines.js";
  import { isSkillComplete } from "#lib/engine/projections/skills.js";
  import { emptyProgress, filteredCounts } from "#lib/engine/shelves.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { shelfLabel } from "#lib/presentation/shelves.js";
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
  import type { AllProgress } from "#lib/engine/categories.js";
  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { Shelf } from "#lib/engine/shelves.js";
  import type { SourceSection } from "#lib/presentation/source-groups.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { QuestId, SkillId, VillagerId } from "#lib/types/tracker-data.js";

  let {
    anchor,
    locale,
    progress,
  }: {
    anchor: string;
    locale: LocaleCode;
    /** The page's progress, so `/everything` computes it once per context. */
    progress: AllProgress;
  } = $props();

  const checkOff = createRowCheckOff<string>();
  const { guard } = checkOff;

  function requestFloor(floor: number): void {
    const seals = sealsBefore(userState.state.progress, floor);
    if (seals) {
      guard.requestGuardedAction(
        seals,
        () => {
          userState.setMineFloor(floor);
        },
        { floor },
      );
    } else {
      userState.setMineFloor(floor);
    }
  }
  // Which Progress categories show, per list, so a search can hide the group when none does. A list
  // that unmounts leaves its keys; they're rewritten on remount, and only read while it's mounted.
  const progressShown: Record<string, boolean> = $state({});

  function progressCategoryShown(completed: boolean): boolean {
    return UNSOURCED_CATEGORY_KEYS.some((category) => progressShown[`${completed}:${category}`]);
  }
  const sectionGrouping = createSectionGrouping<string>();
  registerSourceFilters("almanac", () => trackerIndex.categorySourceTypes.almanac);
  let entries = $derived(
    buildSourceChecklist(userState.progressContext, locale, userState.state.showSpoilers),
  );
  let lookups = $derived(
    buildBaseSegmentLookups(computeSpoileredStoreIds(userState.progressionState), locale),
  );
  // Categories without sources have no source to sit under, so they share the Progress group.
  let progressCategories = $derived(sortCategoryKeysByName(UNSOURCED_CATEGORY_KEYS, locale));
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
    projectSourceGroups(
      entries,
      userState.progressContext,
      (sources) => toolbarState.matchesSourceFilters(sources),
      userState.progressionState,
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
          held: sectionGrouping.heldShelf(section.id),
          visibleRows: section.rows
            .filter(({ entry }) => {
              const spoilered =
                entry.spoilered ||
                !isConditionVisible(entry.visibility, userState.progressionState);
              if (toolbarState.searchQuery && (spoilered || !matchesSearch(entry))) {
                return false;
              }
              return entry.obtainable || toolbarState.showUnobtainable;
            })
            .toSorted((a, b) => nameCollator(locale).compare(a.entry.name, b.entry.name)),
        }))
        .filter(
          ({ spoilered, visibleRows }) =>
            !toolbarState.searchQuery || (!spoilered && visibleRows.length > 0),
        )
        .toSorted((a, b) => compareSourceSections(a, b, locale)),
    })).filter(
      ({ group, sections: groupSections }) => group === "progress" || groupSections.length > 0,
    ),
  );
  let hasCompletedContent = $derived(
    (progressCompletions.includes(true) &&
      (!toolbarState.searchQuery || progressCategoryShown(true))) ||
      groups.some(({ sections: groupSections }) =>
        groupSections.some((entry) => isInCompletedList(entry)),
      ),
  );

  // A link to a finished source has to reach it through the closed fold.
  let anchorInCompleted = $derived(
    groups.some(({ sections: groupSections }) =>
      groupSections.some(
        (entry) =>
          isInCompletedList(entry) &&
          (entry.section.id === anchor ||
            (entry.section.id === "progress" && anchor === "source-progress") ||
            `sources-${entry.section.group}` === anchor ||
            `sources-${entry.section.group}-completed` === anchor),
      ),
    ),
  );

  // The hold starts from the section's current shelf, which the grouping needs to know.
  $effect(() => {
    const reports = sections.map(({ id, state }) => [id, stateShelf(state)] as const);
    untrack(() => {
      for (const [id, shelf] of reports) sectionGrouping.report(id, shelf);
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
    held: Shelf | undefined;
    section: { state: SourceSection<SourceChecklistRow>["state"] };
    spoilered: boolean;
  }): boolean {
    return !spoilered && (held ?? stateShelf(section.state)) === "completed";
  }

  function rowShelfOf({ doable, entry }: { doable: boolean; entry: SourceChecklistRow }): Shelf {
    if (entry.completed) return "completed";
    return doable && entry.obtainable ? "todo" : "notNow";
  }

  /** A source's fraction, with the rest of the shelf counts its header reads. */
  function sectionProgress(
    section: SourceSection<SourceChecklistRow>,
  ): CategoryProgress | undefined {
    // Only revealed unobtainable rows: nothing to count, but the section stays for them.
    if (section.total === 0) return undefined;
    const remaining = section.rows.filter(({ entry }) => entry.obtainable && !entry.completed);
    const todo = remaining.filter(({ doable }) => doable).length;
    return {
      ...emptyProgress(),
      completed: section.completed,
      completedShown: section.completed,
      todo,
      total: section.total,
      waiting: remaining.length - todo,
    };
  }

  function stateShelf(state: SourceSection<SourceChecklistRow>["state"]): Shelf {
    if (state === /* @wc-ignore */ "done") return "completed";
    return state === "now" ? "todo" : "notNow";
  }

  function matchesSearch(entry: SourceChecklistRow): boolean {
    const names = [entry.name, ...(entry.searchNames ?? [])];
    const query = toolbarState.searchQuery;
    return (
      names.some((name) => matchesName(name, query, locale)) ||
      matchesTerms(names, entry.searchTerms ?? [], query, locale)
    );
  }

  // A row can sit under several sources, but it's still one match.
  registerPageSearch(() => {
    const matches = projectSourceGroups(
      entries,
      userState.progressContext,
      () => true,
      userState.progressionState,
    )
      .filter(
        (section) => !sourceSectionLabel(section, lookups, userState.progressionState).spoilered,
      )
      .flatMap(({ rows }) => rows)
      .filter(
        ({ entry }) =>
          !entry.spoilered &&
          isConditionVisible(entry.visibility, userState.progressionState) &&
          (entry.obtainable || toolbarState.showUnobtainable) &&
          matchesSearch(entry),
      );
    const visible = groups.flatMap((group) =>
      group.sections.flatMap(({ visibleRows }) => visibleRows),
    );
    const visibleKeys = new Set(visible.map(({ entry }) => entry.key));
    // A row is doable anywhere through any source, & doable here through a source still shown.
    const shownDoable = new Set(
      visible.filter(({ doable }) => doable).map(({ entry }) => entry.key),
    );
    const doableAnywhere = new Set(
      matches.filter(({ doable }) => doable).map(({ entry }) => entry.key),
    );
    const rows = new Map(
      matches.map(({ entry }) => [
        entry.key,
        {
          completed: entry.completed,
          doable: shownDoable.has(entry.key),
          doableAnywhere: doableAnywhere.has(entry.key),
          shown: visibleKeys.has(entry.key),
          sourceDisclosure: getSourceDisclosure(entry.sources, userState.progressionState),
        },
      ]),
    );
    return { filtered: filteredCounts([...rows.values()]), visible: visibleKeys.size };
  });

  function toggle(entry: SourceChecklistRow, covered: boolean): void {
    checkOff.run({
      category: entry.category,
      covered,
      finish: ({ beforeRecipes, undo }) => {
        const completed = entries.find(({ key }) => key === entry.key)?.completed ?? false;
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
          showUndoToast(entry.name, completed, undo);
        }
        return completed;
      },
      hold: () => {
        const sectionChecks: (() => boolean)[] = [];
        for (const { id, rows } of sections) {
          if (!rows.some(({ entry: row }) => row.key === entry.key)) continue;
          sectionGrouping.hold(id);
          sectionChecks.push(
            () => sections.find((section) => section.id === id)?.state === /* @wc-ignore */ "done",
          );
        }
        return sectionChecks;
      },
      id: entry.key,
      name: entry.name,
      needsGuard:
        !entry.completed &&
        (entry.spoilered || !isConditionVisible(entry.visibility, userState.progressionState)),
      toggle: () => {
        const beforeRecipes = new Set(userState.state.progress.almanacRecipes);
        return { beforeRecipes, undo: entry.toggle() };
      },
      visibility: entry.visibility,
    });
  }
</script>

<SpoilerGuardDialog {guard} />

{#snippet sourceGroups(completed: boolean)}
  {#each groups as { group, sections: allGroupSections } (group)}
    {@const groupSections = allGroupSections.filter(
      (entry) => completed === isInCompletedList(entry),
    )}
    {@const hasProgress = group === "progress" && progressCompletions.includes(completed)}
    {@const hasOutstanding =
      allGroupSections.some((entry) => !isInCompletedList(entry)) ||
      (group === "progress" && progressCompletions.includes(false))}
    {@const groupId = `sources-${group}${completed && hasOutstanding ? "-completed" : ""}`}
    <!-- During a search the mine floor hides, so only matching rows or categories keep the group. -->
    {@const searchMatches =
      groupSections.length > 0 || (group === "progress" && progressCategoryShown(completed))}
    {#if groupSections.length > 0 || hasProgress}
      <GroupSection
        id={groupId}
        name={sourceTypeLabel(group, locale)}
        {completed}
        visible={!toolbarState.searchQuery || searchMatches}
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
              <TrackerRowSection
                {locale}
                depth={1}
                progress={sectionProgress(section)}
                forceOpen={anchor === section.id ||
                  (section.id === "progress" && anchor === "source-progress") ||
                  !!toolbarState.searchQuery}
                name={/* @wc-include */ `${name} · ${
                  section.state === /* @wc-ignore */ "done"
                    ? "Done"
                    : shelfLabel(stateShelf(section.state))
                }`}
                forceShelvesOpen={!!toolbarState.searchQuery}
                getKey={({ entry }) => entry.key}
                getShelf={rowShelfOf}
                isLeaving={({ entry }) => checkOff.isLeaving(entry.key)}
                items={visibleRows}
              >
                {#snippet row({ entry, sources })}
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
                          leaving: checkOff.isLeaving(entry.key),
                        })}
                    name={entry.name}
                    variant={entry.category === "almanac" ? entry.subtitle : undefined}
                    subtitle={[categoryForKey(entry.category, locale).name, entry.subtitle]
                      .filter(Boolean)
                      .join(" · ")}
                    reportCategory={entry.reportCategory}
                    reportEntityId={entry.id}
                    sprite={entry.sprite}
                    spriteClass="text-primary"
                    {sources}
                    segmentLookups={{ ...lookups, entityVisibility: entry.visibility }}
                    onToggle={(covered) => toggle(entry, covered)}
                  />
                {/snippet}
              </TrackerRowSection>
            </SpoilerSection>
          </div>
        {/each}

        {#if group === "progress"}
          <div class="mt-2 flex flex-col gap-6">
            {#if !toolbarState.searchQuery && completed === userState.state.progress.mineFloor >= getMaxMineFloor()}
              <MineFloorRecord
                compact
                biomes={trackerData.mines.biomes}
                floor={userState.state.progress.mineFloor}
                {locale}
                onChange={requestFloor}
              />
            {/if}
            {#each progressCategories as category (category)}
              <CategorySection
                key={category}
                {locale}
                progress={progress[category]}
                {completed}
                bind:shown={progressShown[`${completed}:${category}`]}
              />
            {/each}
          </div>
        {/if}
      </GroupSection>
    {/if}
  {/each}
{/snippet}

<div class="flex flex-col gap-6">
  {@render sourceGroups(false)}
</div>

<div class="flex flex-col gap-6" data-testid="everything-completed" hidden={!hasCompletedContent}>
  <ShelfFold
    explains
    forceOpen={!!toolbarState.searchQuery || anchorInCompleted}
    level={2}
    shelf="completed"
  >
    <div class="flex flex-col gap-6">
      {@render sourceGroups(true)}
    </div>
  </ShelfFold>
</div>
