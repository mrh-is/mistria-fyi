<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import LedgerIndex from "#lib/components/ledger/ledger-index.svelte";
  import LedgerNotice from "#lib/components/ledger/ledger-notice.svelte";
  import LedgerRow from "#lib/components/ledger/ledger-row.svelte";
  import LedgerSection from "#lib/components/ledger/ledger-section.svelte";
  import MineFloorRecord from "#lib/components/mine-floor-record.svelte";
  import ShelfFold from "#lib/components/shelf-fold.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import SpoilerSection from "#lib/components/spoiler-section.svelte";
  import { createRowCheckOff } from "#lib/controllers/check-off.svelte.js";
  import { createLedgerSnapshot } from "#lib/controllers/ledger-snapshot.svelte.js";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { buildSourceChecklist } from "#lib/controllers/source-checklist.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { categoryForKey, sortCategoryKeysByName } from "#lib/data/categories.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { nameCollator } from "#lib/data/names.js";
  import { showQuestToast, showUndoToast } from "#lib/effects/undo-toast.js";
  import { UNSOURCED_CATEGORY_KEYS } from "#lib/engine/categories.js";
  import { getMaxMineFloor, getMaxRenownLevel, isVillagerComplete } from "#lib/engine/progress.js";
  import { sealsBefore } from "#lib/engine/projections/mines.js";
  import { isSkillComplete } from "#lib/engine/projections/skills.js";
  import { filteredCounts } from "#lib/engine/shelves.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { ledgerPlacement, ledgerShelf } from "#lib/presentation/ledger.js";
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

  import CategorySection from "./category-section.svelte";
  import GroupSection from "./group-section.svelte";

  import type { SourceChecklistRow } from "#lib/controllers/source-checklist.js";
  import type { AllProgress } from "#lib/engine/categories.js";
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

  const checkOff = createRowCheckOff<string>({ animateLeaving: false });
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
  registerSourceFilters("almanac", () => trackerIndex.categorySourceTypes.almanac);
  let entries = $derived(buildSourceChecklist(userState.progressContext, locale));
  let liveEntries = $derived(new Map(entries.map((entry) => [entry.key, entry])));
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
  const ledger = createLedgerSnapshot(
    () => locale,
    () => {
      const day = userState.progressContext;
      const visibility = day.progressionState;
      return projectSourceGroups(entries, day, undefined, visibility).map((section) => ({
        section,
        ...sourceSectionLabel(section, lookups, visibility),
        rows: section.rows
          .map(({ doable, entry, sources }) => ({
            entry,
            key: entry.key,
            ...ledgerPlacement(
              sources,
              day,
              visibility,
              {
                completed: entry.completed,
                doable: doable && entry.obtainable,
                spoilered: Boolean(
                  entry.spoilered || !isConditionVisible(entry.visibility, visibility),
                ),
              },
              entry.sources,
            ),
          }))
          .toSorted((a, b) => nameCollator(locale).compare(a.entry.name, b.entry.name)),
      }));
    },
  );

  type Placement = (typeof ledger.value)[number]["rows"][number];
  function visibleRow(row: Placement): boolean {
    if (!row.entry.obtainable && !toolbarState.showUnobtainable) return false;
    return (
      !toolbarState.searchQuery ||
      ((!row.spoilered || userState.state.showSpoilers) && matchesSearch(row.entry))
    );
  }

  let groups = $derived(
    SOURCE_TYPE_ORDER.map((group) => ({
      group,
      sections: ledger.value
        .filter(
          ({ rows, section, spoilered }) =>
            section.group === group &&
            (!toolbarState.searchQuery || !spoilered || userState.state.showSpoilers) &&
            rows.some((row) => visibleRow(row) && toolbarState.matchesSourceFilters(row.sources)),
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
  let completedMatches = $derived.by(() => {
    if (!toolbarState.searchQuery) return undefined;
    const matches = groups.flatMap(({ sections: groupSections }) =>
      groupSections
        .filter((entry) => isInCompletedList(entry))
        .flatMap(({ rows }) =>
          rows.filter((row) => visibleRow(row) && toolbarState.matchesSourceFilters(row.sources)),
        ),
    );
    const uniqueCount = new Set(matches.map(({ key }) => key)).size;
    return uniqueCount > 0 ? uniqueCount : undefined;
  });

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
    section,
    spoilered,
  }: {
    section: { state: SourceSection<SourceChecklistRow>["state"] };
    spoilered: boolean;
  }): boolean {
    return !spoilered && section.state === /* @wc-ignore */ "done";
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
    const matches = ledger.value
      .filter(({ spoilered }) => !spoilered || userState.state.showSpoilers)
      .flatMap(({ rows }) => rows)
      .filter((row) => (!row.spoilered || userState.state.showSpoilers) && visibleRow(row));
    const visible = matches.filter(({ sources }) => toolbarState.matchesSourceFilters(sources));
    const visibleKeys = new Set(visible.map(({ entry }) => entry.key));
    // A row is doable anywhere through any source, & doable here through a source still shown.
    const shownDoable = new Set(
      visible
        .filter((row) => ledgerShelf(row, toolbarState.showsSource) === "todo")
        .map(({ entry }) => entry.key),
    );
    const doableAnywhere = new Set(
      matches.filter(({ doable }) => doable).map(({ entry }) => entry.key),
    );
    const rows = new Map(
      matches.map(({ entry, hiddenCount, visibleSources }) => [
        entry.key,
        {
          completed: entry.completed,
          doable: shownDoable.has(entry.key),
          doableAnywhere: doableAnywhere.has(entry.key),
          shown: visibleKeys.has(entry.key),
          sourceDisclosure: { hiddenCount, visibleSources },
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
        for (const {
          section: { rows },
        } of ledger.value) {
          if (!rows.some(({ entry: row }) => row.key === entry.key)) continue;
          sectionChecks.push(() =>
            rows.every(
              ({ entry: row }) => !row.obtainable || liveEntries.get(row.key)?.completed === true,
            ),
          );
        }
        return sectionChecks;
      },
      id: entry.key,
      name: entry.name,
      needsGuard:
        !entry.completed &&
        ((entry.spoilered && !userState.state.showSpoilers) ||
          !isConditionVisible(entry.visibility, userState.progressionState)),
      toggle: () => {
        const beforeRecipes = new Set(userState.state.progress.almanacRecipes);
        return { beforeRecipes, undo: entry.toggle() };
      },
      visibility: entry.visibility,
    });
  }
</script>

<SpoilerGuardDialog {guard} />
<LedgerNotice changed={ledger.needsRefresh} onRefresh={ledger.refresh} />

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

        {#each groupSections as { section, name, spoilered, rows } (section.id)}
          <div
            id={section.id === "progress" ? "source-progress" : section.id}
            class="scroll-mt-[var(--ledger-anchor-offset,8rem)]"
            data-source-section
            data-source-status={spoilered ? undefined : section.state}
          >
            <SpoilerSection {name} spoilered={spoilered && !userState.state.showSpoilers}>
              <LedgerSection
                collapsible
                {locale}
                {name}
                {rows}
                visible={visibleRow}
                forceOpen={anchor === section.id ||
                  (section.id === "progress" && anchor === "source-progress")}
              >
                {#snippet row(placement, shelf, columns, discovery, highlighted)}
                  {@const entry = liveEntries.get(placement.key) ?? placement.entry}
                  <LedgerRow
                    {placement}
                    {columns}
                    {shelf}
                    {discovery}
                    {highlighted}
                    category={entry.category}
                    fact={entry.fact}
                    id={entry.id}
                    completed={entry.completed}
                    obtained={entry.questState === "obtained" && !placement.spoilered}
                    name={entry.name}
                    variant={entry.category === "almanac" ? entry.subtitle : undefined}
                    subtitle={[categoryForKey(entry.category, locale).name, entry.subtitle]
                      .filter(Boolean)
                      .join(" · ")}
                    reportCategory={entry.reportCategory}
                    sprite={entry.sprite}
                    lookups={{ ...lookups, entityVisibility: entry.visibility }}
                    onToggle={(covered) => toggle(entry, covered)}
                  />
                {/snippet}
              </LedgerSection>
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

<LedgerIndex
  sections={groups
    .filter(({ sections }) => sections.some((entry) => !isInCompletedList(entry)))
    .map(({ group }) => ({ id: `sources-${group}`, name: sourceTypeLabel(group, locale) }))}
>
  <div class="flex flex-col gap-6">
    {@render sourceGroups(false)}
  </div>

  <div class="flex flex-col gap-6" data-testid="everything-completed" hidden={!hasCompletedContent}>
    <ShelfFold
      explains
      forceOpen={anchorInCompleted}
      keepMounted={Boolean(toolbarState.searchQuery)}
      level={2}
      matchCount={completedMatches}
      shelf="completed"
    >
      <div class="flex flex-col gap-6">
        {@render sourceGroups(true)}
      </div>
    </ShelfFold>
  </div>
</LedgerIndex>
