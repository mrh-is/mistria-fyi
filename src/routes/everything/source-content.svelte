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
  import { createLedgerPage, useLedgerArrival } from "#lib/controllers/ledger-page.svelte.js";
  import { buildSourceChecklist } from "#lib/controllers/source-checklist.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { categoryForKey, sortCategoryKeysByName } from "#lib/data/categories.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { nameCollator } from "#lib/data/names.js";
  import { captureUndoFocus, showQuestToast, showUndoToast } from "#lib/effects/undo-toast.js";
  import { UNSOURCED_CATEGORY_KEYS } from "#lib/engine/categories.js";
  import { getMaxMineFloor, getMaxRenownLevel, isVillagerComplete } from "#lib/engine/progress.js";
  import { mineFloorProgress, sealsBefore } from "#lib/engine/projections/mines.js";
  import { isSkillComplete } from "#lib/engine/projections/skills.js";
  import { addProgress, countShelfRows } from "#lib/engine/shelves.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { ledgerSourceFamily, sourceLedgerPlacement } from "#lib/presentation/ledger.js";
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
  import { formatNumber } from "#lib/utils/format.js";
  import { matchesName, matchesTerms } from "#lib/utils/name-match.js";

  import CategorySection from "./category-section.svelte";
  import GroupSection from "./group-section.svelte";
  import VillagerErrands from "./villager-errands.svelte";

  import type { SourceChecklistRow } from "#lib/controllers/source-checklist.js";
  import type { AllProgress } from "#lib/engine/categories.js";
  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { SourceSection } from "#lib/presentation/source-groups.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { QuestId, SkillId } from "#lib/types/tracker-data.js";

  let {
    anchor,
    locale,
    placeProgress = $bindable(),
    progress,
  }: {
    anchor: string;
    locale: LocaleCode;
    placeProgress?: CategoryProgress;
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
    return recordCategories.some((category) => progressShown[`${completed}:${category}`]);
  }
  registerSourceFilters("almanac", () => trackerIndex.categorySourceTypes.almanac);
  let entries = $derived(buildSourceChecklist(userState.progressContext, locale));
  let liveEntries = $derived(new Map(entries.map((entry) => [entry.key, entry])));
  let lookups = $derived(
    buildBaseSegmentLookups(computeSpoileredStoreIds(userState.progressionState), locale),
  );
  // Categories without sources have no source to sit under, so they share the Progress group.
  const recordCategories = UNSOURCED_CATEGORY_KEYS.filter((category) => category !== "villagers");
  let progressCategories = $derived(sortCategoryKeysByName(recordCategories, locale));
  let progressCompletions = $derived([
    userState.state.progress.mineFloor >= getMaxMineFloor(),
    userState.state.progress.renown >= getMaxRenownLevel(),
    ...Object.keys(trackerData.skills).map((id) =>
      isSkillComplete(id as SkillId, userState.state.progress),
    ),
  ]);
  let completedVillagers = $derived(
    [...userState.progressContext.progressionState.knownVillagers].some((id) =>
      isVillagerComplete(id, userState.state.progress),
    ),
  );
  let villagerGroupShown = $state(false);
  let completedVillagerGroupShown = $state(false);
  const {
    restoringScroll,
    snapshot: ledger,
    visible: visibleRow,
  } = createLedgerPage(
    () => locale,
    () => {
      const day = userState.progressContext;
      const visibility = day.progressionState;
      return projectSourceGroups(entries, day, undefined, visibility)
        .map((section) => ({
          section,
          ...sourceSectionLabel(section, lookups, visibility),
          rows: section.rows
            .map((placement) => ({
              counted: placement.counted,
              entry: placement.entry,
              key: placement.entry.key,
              obtainable: placement.entry.obtainable,
              ...sourceLedgerPlacement(placement, day),
            }))
            .toSorted((a, b) => nameCollator(locale).compare(a.entry.name, b.entry.name)),
        }))
        .toSorted(
          (a, b) =>
            SOURCE_TYPE_ORDER.indexOf(a.section.group) -
              SOURCE_TYPE_ORDER.indexOf(b.section.group) ||
            compareSourceSections(a, b, locale, day.worldState),
        );
    },
    (row) => matchesSearch(row.entry),
    { excludeCoveredFromFilterCounts: true, scrollKey: "everything-source" },
  );

  useLedgerArrival(() => (ledger.ready ? anchor : ""), restoringScroll);

  let countedProgress = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scratch totals for this snapshot.
    const facts = new Map<string, { completed: boolean; doable: boolean }>();
    for (const { rows, spoilered } of ledger.value) {
      if (spoilered) continue;
      for (const row of rows) {
        if (!row.counted) continue;
        facts.set(row.key, {
          completed: row.completed,
          doable: row.doable || facts.get(row.key)?.doable === true,
        });
      }
    }
    return addProgress([
      countShelfRows(
        [...facts.values()].map((fact) => ({
          ...fact,
          doableAnywhere: fact.doable,
          shown: true,
          sourceDisclosure: { hiddenCount: 0, visibleSources: [] },
        })),
      ),
      mineFloorProgress(userState.state.progress),
      ...UNSOURCED_CATEGORY_KEYS.map((category) => progress[category]),
    ]);
  });
  $effect(() => {
    placeProgress = ledger.ready ? countedProgress : undefined;
  });

  function showsPlace({ rows, spoilered }: (typeof ledger.value)[number]): boolean {
    return (
      (!toolbarState.searchQuery || !spoilered || userState.state.showSpoilers) &&
      rows.some((row) => visibleRow(row) && toolbarState.matchesSourceFilters(row.sources))
    );
  }

  let groups = $derived(
    SOURCE_TYPE_ORDER.map((group) => ({
      group,
      sections: ledger.value.filter(
        ({ rows, section }) =>
          section.group === group &&
          rows.some(
            (row) =>
              (row.obtainable || toolbarState.showUnobtainable) &&
              toolbarState.matchesSourceFilters(row.sources),
          ),
      ),
    })).filter(
      ({ group, sections: groupSections }) => group === "progress" || groupSections.length > 0,
    ),
  );
  let hasCompletedContent = $derived(
    (completedVillagers && (!toolbarState.searchQuery || completedVillagerGroupShown)) ||
      (progressCompletions.includes(true) &&
        (!toolbarState.searchQuery || progressCategoryShown(true))) ||
      groups.some(({ sections: groupSections }) =>
        groupSections.some((entry) => isInCompletedList(entry) && showsPlace(entry)),
      ),
  );
  let completedMatches = $derived.by(() => {
    if (!toolbarState.searchQuery) return undefined;
    const matches = groups.flatMap(({ sections: groupSections }) =>
      groupSections
        .filter((entry) => isInCompletedList(entry) && showsPlace(entry))
        .flatMap(({ rows }) =>
          rows.filter(
            (row) =>
              row.counted && visibleRow(row) && toolbarState.matchesSourceFilters(row.sources),
          ),
        ),
    );
    const uniqueCount = new Set(matches.map(({ key }) => key)).size;
    return uniqueCount > 0 ? uniqueCount : undefined;
  });

  // A link to a finished source has to reach it through the closed fold.
  let anchorInCompleted = $derived(
    anchor === "sources-villagers-completed" ||
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

  function groupCount(sections: typeof ledger.value): number {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Deduplicate placements for one count.
    const facts = new Set<string>();
    for (const { rows, spoilered } of sections) {
      if (spoilered) continue;
      for (const row of rows) {
        if (row.counted && visibleRow(row) && toolbarState.matchesSourceFilters(row.sources)) {
          facts.add(row.key);
        }
      }
    }
    return facts.size;
  }

  function matchesSearch(entry: SourceChecklistRow): boolean {
    const names = [entry.name, ...(entry.searchNames ?? [])];
    const query = toolbarState.searchQuery;
    return (
      names.some((name) => matchesName(name, query, locale)) ||
      matchesTerms(names, entry.searchTerms ?? [], query, locale)
    );
  }

  function toggle(entry: SourceChecklistRow, covered: boolean): void {
    const focus = captureUndoFocus();
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
            covered,
            focus,
          );
        } else {
          showUndoToast(entry.name, completed, undo, covered, focus);
        }
        return completed;
      },
      hold: () => {
        const sectionChecks: (() => boolean)[] = [];
        for (const {
          section: { rows },
        } of ledger.value) {
          if (!rows.some(({ counted, entry: row }) => counted && row.key === entry.key)) continue;
          sectionChecks.push(() =>
            rows.every(
              ({ counted, entry: row }) => !counted || liveEntries.get(row.key)?.completed === true,
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
    {@const recordCount =
      hasProgress && !toolbarState.searchQuery
        ? progressCompletions.filter((done) => done === completed).length
        : 0}
    {@const hasOutstanding =
      allGroupSections.some((entry) => !isInCompletedList(entry)) ||
      (group === "progress" && progressCompletions.includes(false))}
    {@const groupId = `sources-${group}${completed && hasOutstanding ? "-completed" : ""}`}
    <!-- During a search the mine floor hides, so only matching rows or categories keep the group. -->
    {@const searchMatches =
      groupSections.some(showsPlace) || (group === "progress" && progressCategoryShown(completed))}
    {#if groupSections.length > 0 || hasProgress}
      <GroupSection
        id={groupId}
        name={sourceTypeLabel(group, locale)}
        {completed}
        findable
        placeGroup
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
        {#snippet count()}
          <span class="font-data text-sm font-normal text-muted-foreground">
            {formatNumber(groupCount(groupSections) + recordCount, locale)}
          </span>
        {/snippet}

        {#each groupSections as entry (entry.section.id)}
          {@const { section, name, spoilered, rows } = entry}
          <div
            id={section.id === "progress" ? "source-progress" : section.id}
            class="scroll-mt-[var(--ledger-anchor-offset,8rem)]"
            data-source-section
            data-source-status={spoilered ? undefined : section.state}
            hidden={!showsPlace(entry)}
          >
            <SpoilerSection {name} spoilered={spoilered && !userState.state.showSpoilers}>
              <LedgerSection
                collapsible
                place
                countsRow={(row) => row.counted && !spoilered}
                {locale}
                {name}
                {rows}
                contextualFamily={section.source && ledgerSourceFamily(section.source)}
                progress={spoilered ? undefined : section}
                visible={visibleRow}
                openOnArrival={anchor === section.id ||
                  (section.id === "progress" && anchor === "source-progress")}
              >
                {#snippet row(
                  placement,
                  shelf,
                  columns,
                  discovery,
                  highlighted,
                  active,
                  onFind,
                  searchMiss,
                )}
                  {@const entry = active
                    ? (liveEntries.get(placement.key) ?? placement.entry)
                    : placement.entry}
                  <LedgerRow
                    {placement}
                    {active}
                    {onFind}
                    {columns}
                    {shelf}
                    {discovery}
                    {highlighted}
                    {searchMiss}
                    category={entry.category}
                    fact={entry.fact}
                    id={entry.id}
                    completed={entry.completed}
                    obtained={entry.questState === "obtained" && !placement.spoilered}
                    name={entry.name}
                    variant={entry.category === "almanac" ? entry.subtitle : undefined}
                    subtitle={entry.category === "quests" ? undefined : entry.subtitle}
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
  sections={[
    ...(villagerGroupShown
      ? [{ id: "sources-villagers", name: categoryForKey("villagers", locale).name }]
      : []),
    ...groups
      .filter(({ sections }) =>
        sections.some((entry) => !isInCompletedList(entry) && showsPlace(entry)),
      )
      .map(({ group }) => ({ id: `sources-${group}`, name: sourceTypeLabel(group, locale) })),
  ]}
>
  <div class="flex flex-col gap-6">
    {#if ledger.ready}<VillagerErrands {anchor} {locale} bind:shown={villagerGroupShown} />{/if}
    {@render sourceGroups(false)}
  </div>

  <div class="flex flex-col gap-6" data-testid="everything-completed" hidden={!hasCompletedContent}>
    <ShelfFold
      explains
      findable
      openOnArrival={anchorInCompleted}
      level={2}
      matchCount={completedMatches}
      shelf="completed"
    >
      <div class="flex flex-col gap-6">
        {#if completedVillagers}
          <VillagerErrands {anchor} {locale} completed bind:shown={completedVillagerGroupShown} />
        {/if}
        {@render sourceGroups(true)}
      </div>
    </ShelfFold>
  </div>
</LedgerIndex>
