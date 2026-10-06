<script lang="ts">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import SpoilerSection from "#lib/components/spoiler-section.svelte";
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { showQuestToast } from "#lib/effects/undo-toast.js";
  import { isCategoryComplete } from "#lib/engine/progress.js";
  import { isEntityNameVisible, isVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { buildQuestSections } from "#lib/presentation/quest-sections.js";
  import { computeRedactedStoreIds } from "#lib/sources/redacted-stores.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import AllCompleted from "./all-completed.svelte";

  import type { QuestRow, QuestSection } from "#lib/presentation/quest-sections.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { QuestId, QuestType } from "#lib/types/tracker-data.js";
  import type { QuestState } from "#lib/types/user-progress.js";
  import type { TrackerRowDisplay } from "#lib/utils/row-display.js";

  let { locale }: { locale: LocaleCode } = $props();

  const spoilerGuard = createSpoilerGuard();

  let redactedStoreIds = $derived(computeRedactedStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds, locale));

  let sections = $derived(buildQuestSections(userState.state.completed, locale));

  /** A section's rows within the source filters, with their counter values. */
  interface SectionView {
    categoryRevealed: boolean;
    completedCount: number;
    scopedRows: QuestRow[];
    section: QuestSection;
    visibleRows: QuestRow[];
  }

  let sectionViews = $derived(
    sections.map((section): SectionView => {
      const scopedRows = section.rows.filter(
        (row) => row.kind === "craving" || toolbarState.matchesSourceFilters(row.sources),
      );
      return {
        categoryRevealed: isVisible(
          trackerData.categoryVisibility[section.questType],
          userState.progressionState,
        ),
        completedCount: scopedRows.filter((row) => isRowCompleted(row)).length,
        scopedRows,
        section,
        visibleRows: scopedRows.filter((row) =>
          isRowCompleted(row) ? userState.state.showCompleted : true,
        ),
      };
    }),
  );

  registerSourceFilters("quests", () => trackerIndex.categorySourceTypes.quests);

  function getQuestState(id: QuestId): QuestState {
    return userState.state.completed.questStates[id] ?? "none";
  }

  function isRowCompleted(row: QuestRow): boolean {
    return row.kind === "craving" ? row.completed : getQuestState(row.id) === "completed";
  }

  function questRowDisplay(questState: QuestState, nameVisible: boolean): TrackerRowDisplay {
    if (nameVisible && questState === "obtained") return { mode: "obtained" };
    return trackerRowDisplay({ completed: questState === "completed", nameVisible });
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
    const completion = userState.completeQuestWithRecipes(questId);
    const newState = getQuestState(questId);
    showQuestToast(displayName, newState, completion.newlyAdded, locale, () => {
      userState.undoQuestWithRecipes(questId, completion);
    });
    if (newState !== "completed") return;
    if (isCategoryComplete("quests", userState.state)) {
      celebrateCategory();
    } else if (section.rows.every((row) => getQuestState(row.id) === "completed")) {
      celebrate();
    }
  }
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

{#each sectionViews as { categoryRevealed, completedCount, scopedRows, section, visibleRows } (section.questType)}
  <SpoilerSection name={typeLabel(section.questType)} revealed={categoryRevealed}>
    {#if visibleRows.length > 0}
      <ExpandableSection
        {locale}
        count={completedCount}
        name={typeLabel(section.questType)}
        reportCategory="quest-section"
        reportEntityId={section.questType}
        total={scopedRows.length}
      >
        <TrackerRowList getKey={(row) => row.id} items={visibleRows}>
          {#snippet row(row)}
            {#if row.kind === "craving"}
              <TrackerRow
                display={questRowDisplay(row.completed ? "completed" : "none", !!row.villager)}
                lookups={baseLookups}
                name={row.displayName}
                reportCategory="craving-quest"
                reportEntityId={row.id}
                sources={[]}
                subtitle={row.subtitle}
                onToggle={() => {
                  if (row.questId) completeQuest(row.questId, row.displayName, section);
                }}
              />
            {:else}
              {@const questState = getQuestState(row.id)}
              {@const nameVisible = isEntityNameVisible(row.visibility, userState.progressionState)}
              <TrackerRow
                display={questRowDisplay(questState, nameVisible)}
                lookups={{ ...baseLookups, entityVisibility: row.visibility }}
                name={row.displayName}
                reportCategory="quest"
                reportEntityId={row.id}
                sources={row.sources}
                subtitle={row.subtitle}
                onToggle={() => {
                  if (nameVisible || questState !== "none") {
                    completeQuest(row.id, row.displayName, section);
                  } else {
                    spoilerGuard.guard(row.visibility, () => {
                      completeQuest(row.id, row.displayName, section);
                    });
                  }
                }}
              />
            {/if}
          {/snippet}
        </TrackerRowList>
      </ExpandableSection>
    {:else}
      <TrackerEmptyState />
    {/if}
  </SpoilerSection>
{/each}

<AllCompleted isAllCompleted={isCategoryComplete("quests", userState.state)} />
