<script lang="ts">
  import AllCompleted from "#lib/components/all-completed.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SectionGroups from "#lib/components/section-groups.svelte";
  import ShelfRows from "#lib/components/shelf-rows.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import SpoilerSection from "#lib/components/spoiler-section.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { celebrateProgress } from "#lib/controllers/celebration.js";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { showQuestToast } from "#lib/effects/undo-toast.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { cravingFacts, projectQuests } from "#lib/engine/projections/quests.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { countShelfRows, filteredCounts, progressShelf, rowShelf } from "#lib/engine/shelves.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { buildQuestSections } from "#lib/presentation/quest-sections.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { ShelfRow } from "#lib/engine/shelves.js";
  import type { QuestRow, QuestSection } from "#lib/presentation/quest-sections.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { QuestId, QuestType } from "#lib/types/tracker-data.js";
  import type { QuestState } from "#lib/types/user-progress.js";
  import type { TrackerRowDisplay } from "#lib/utils/row-display.js";

  let { locale }: { locale: LocaleCode } = $props();

  const spoilerGuard = createSpoilerGuard();
  const sectionGrouping = createSectionGrouping<QuestType>();

  let spoileredStoreIds = $derived(computeSpoileredStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(spoileredStoreIds, locale));

  let sections = $derived(buildQuestSections(userState.state.progress, locale));

  type ShelvedQuestRow = QuestRow & ShelfRow;

  /** A section's rows within the source filters, with their counter values. */
  interface SectionView {
    categorySpoilered: boolean;
    /** The rows the search matches, whatever the page's filters say. */
    namedRows: ShelvedQuestRow[];
    progress: CategoryProgress;
    section: QuestSection;
    visibleRows: ShelvedQuestRow[];
  }

  let questFacts = $derived(
    new Map(
      projectQuests(userState.progressContext, { showsSource: toolbarState.showsSource }).rows.map(
        (row) => [row.id, row],
      ),
    ),
  );

  function withShelf(row: QuestRow): ShelvedQuestRow {
    if (row.kind === "quest") {
      const facts = questFacts.get(row.id);
      if (!facts) throw new Error(`Quest row without a projection: ${row.id}`);
      return { ...row, ...facts };
    }
    return { ...row, ...cravingFacts(row, userState.progressContext) };
  }

  let nameFilter = $derived(toolbarState.searchQuery);

  function matchesSearch(row: QuestRow): boolean {
    const spoilered =
      row.kind === "craving"
        ? !row.villagerId
        : !isConditionVisible(row.visibility, userState.progressionState);
    return !spoilered && matchesName(row.displayName, nameFilter, locale);
  }

  let sectionViews = $derived(
    sections.map((section): SectionView => {
      const categorySpoilered = !isConditionVisible(
        trackerData.categoryVisibility[section.questType],
        userState.progressionState,
      );
      const rows = section.rows.map((row) => withShelf(row));
      let namedRows = rows;
      if (nameFilter) namedRows = categorySpoilered ? [] : rows.filter((row) => matchesSearch(row));
      return {
        categorySpoilered,
        namedRows,
        progress: countShelfRows(rows),
        section,
        visibleRows: namedRows.filter(({ shown }) => shown),
      };
    }),
  );

  registerPageSearch(() => ({
    filtered: filteredCounts(sectionViews.flatMap((view) => view.namedRows)),
    visible: sectionViews.reduce((sum, view) => sum + view.visibleRows.length, 0),
  }));

  registerSourceFilters("quests", () => trackerIndex.categorySourceTypes.quests);

  function getQuestState(id: QuestId): QuestState {
    return userState.state.progress.questStates[id] ?? "none";
  }

  function questRowDisplay(questState: QuestState, spoilered: boolean): TrackerRowDisplay {
    if (!spoilered && questState === "obtained") return { mode: "obtained" };
    return trackerRowDisplay({ completed: questState === "completed", spoilered });
  }

  function typeLabel(type: QuestType): string {
    switch (type) {
      case "cooking":
        return getName("ui", "cooking_challenges", locale);
      case "crown":
        return getName("ui", "crown_requests", locale);
      case "fetch":
        return m.quest_type_fetch();
      case "heart":
        return getName("ui", "heart_quests", locale);
      case "mission":
        return getName("ui", "mission_quests", locale);
      case "story":
        return getName("ui", "story_quests", locale);
    }
  }

  function completeQuest(questId: QuestId, displayName: string, section: QuestSection): void {
    sectionGrouping.hold(section.questType);
    const isSectionComplete = () =>
      section.rows.every((row) => getQuestState(row.id) === "completed");
    const completion = celebrateProgress(
      "quests",
      () => userState.completeQuestWithRecipes(questId),
      [isSectionComplete],
    );
    if (!completion) return;
    const newState = getQuestState(questId);
    showQuestToast(displayName, newState, completion.newlyAdded, locale, () => {
      userState.undoQuestWithRecipes(questId, completion);
    });
  }
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

<SectionGroups
  forceOpen={!!nameFilter}
  getKey={(view) => view.section.questType}
  grouping={sectionGrouping}
  items={sectionViews}
>
  {#snippet section({ categorySpoilered, progress, section: questSection, visibleRows })}
    {#if !nameFilter || visibleRows.length > 0}
      <SpoilerSection
        maskedShelf={progressShelf(progress)}
        name={typeLabel(questSection.questType)}
        spoilered={categorySpoilered}
        topLevel
      >
        <ExpandableSection
          {locale}
          forceOpen={!!nameFilter}
          name={typeLabel(questSection.questType)}
          {progress}
          reportCategory="quest-section"
          reportEntityId={questSection.questType}
        >
          <ShelfRows
            forceOpen={!!nameFilter}
            getKey={(row) => row.id}
            getShelf={rowShelf}
            items={visibleRows}
          >
            {#snippet row(row)}
              {#if row.kind === "craving"}
                <TrackerRow
                  fact={factKey("questStates", row.questId ?? row.id)}
                  display={questRowDisplay(row.completed ? "completed" : "none", !row.villagerId)}
                  segmentLookups={baseLookups}
                  name={row.displayName}
                  reportCategory="craving-quest"
                  reportEntityId={row.id}
                  sources={[]}
                  subtitle={row.subtitle}
                  onToggle={() => {
                    if (row.questId) completeQuest(row.questId, row.displayName, questSection);
                  }}
                />
              {:else}
                {@const questState = getQuestState(row.id)}
                {@const spoilered = !isConditionVisible(row.visibility, userState.progressionState)}
                <TrackerRow
                  fact={factKey("questStates", row.id)}
                  display={questRowDisplay(questState, spoilered)}
                  segmentLookups={{ ...baseLookups, entityVisibility: row.visibility }}
                  name={row.displayName}
                  reportCategory="quest"
                  reportEntityId={row.id}
                  sources={row.sources}
                  subtitle={row.subtitle}
                  onToggle={() => {
                    if (!spoilered || questState !== "none") {
                      completeQuest(row.id, row.displayName, questSection);
                    } else {
                      spoilerGuard.requestGuardedAction(row.visibility, () => {
                        completeQuest(row.id, row.displayName, questSection);
                      });
                    }
                  }}
                />
              {/if}
            {/snippet}
          </ShelfRows>
        </ExpandableSection>
      </SpoilerSection>
    {/if}
  {/snippet}
</SectionGroups>

<AllCompleted isAllCompleted={isCategoryComplete("quests", userState.progressContext)} />
