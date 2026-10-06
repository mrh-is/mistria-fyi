<script lang="ts">
  import { toast } from "svelte-sonner";

  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import SpoilerSection from "#lib/components/spoiler-section.svelte";
  import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
  import TrackerRowList from "#lib/components/tracker-row-list.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
  import { getCravingQuest, PREGNANCY_QUEST_IDS } from "#lib/engine/craving-quest.js";
  import { isCategoryComplete } from "#lib/engine/progress.js";
  import { recipeDisplayNames } from "#lib/engine/quest-rewards.js";
  import { isEntityNameVisible, isVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { computeRedactedStoreIds } from "#lib/sources/redacted-stores.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { displayQuestName } from "#lib/utils/en-grammar.js";
  import { trackerRowDisplay } from "#lib/utils/row-display.js";

  import AllCompleted from "./all-completed.svelte";

  import type { Source } from "#lib/types/acquisition.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type {
    FetchQuest,
    HeartQuest,
    QuestId,
    QuestType,
    VillagerId,
  } from "#lib/types/tracker-data.js";
  import type { QuestState } from "#lib/types/user-progress.js";
  import type { VisibilityCondition } from "#lib/types/visibility.js";
  import type { TrackerRowDisplay } from "#lib/utils/row-display.js";

  let { locale }: { locale: LocaleCode } = $props();

  const spoilerGuard = createSpoilerGuard();

  let redactedStoreIds = $derived(computeRedactedStoreIds(userState.progressionState));

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds, locale));

  function findDuplicateNames(entries: { displayName: string }[]): Set<string> {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      counts[e.displayName] = (counts[e.displayName] ?? 0) + 1;
    }
    return new Set(
      Object.entries(counts)
        .filter(([, c]) => c > 1)
        .map(([n]) => n),
    );
  }

  function isQuestsComplete(): boolean {
    return isCategoryComplete("quests", userState.state);
  }

  function isQuestTypeComplete(questIds: QuestId[]): boolean {
    return questIds.every((id) => getQuestState(id) === "completed");
  }

  function questNameVisible(questType: QuestType, questId: QuestId): boolean {
    return isEntityNameVisible(questVisibility(questType, questId), userState.progressionState);
  }

  function questRowDisplay(questState: QuestState, nameVisible: boolean): TrackerRowDisplay {
    if (nameVisible && questState === "obtained") return { mode: "obtained" };
    return trackerRowDisplay({ completed: questState === "completed", nameVisible });
  }

  function questSources(questType: QuestType, questId: QuestId): Source[] {
    if (questType === "fetch") {
      const { itemId } = trackerData.quests.fetch[questId];
      return [...trackerData.items[itemId].sources];
    }
    if (questType === "cooking") {
      const quest = trackerData.quests.cooking[questId];
      const recipe = "recipeId" in quest ? trackerData.recipes[quest.recipeId] : undefined;
      if (recipe) return [...recipe.sources];
    }
    return [];
  }

  function questSubtitle(
    quest: { displayName: string; rewardRecipeName?: string; villager?: VillagerId },
    questType: QuestType,
    duplicateNames: Set<string>,
  ): string | undefined {
    const { displayName, rewardRecipeName, villager } = quest;
    if (!villager) return undefined;
    if (questType === "fetch" || questType === "heart" || duplicateNames.has(displayName)) {
      const villagerName = getName("villagers", villager, locale);
      if (duplicateNames.has(displayName) && rewardRecipeName) {
        return `${villagerName} · ${rewardRecipeName}`;
      }
      return villagerName;
    }
    return undefined;
  }

  function questVisibility(
    questType: QuestType,
    questId: QuestId,
  ): undefined | VisibilityCondition {
    return trackerData.quests[questType][questId].visibility;
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

  const typeOrder = ["story", "heart", "fetch", "crown", "mission", "cooking"] as QuestType[];

  registerSourceFilters("quests", () => trackerIndex.categorySourceTypes.quests);

  function getQuestState(id: QuestId): QuestState {
    return userState.state.completed.questStates[id] ?? "none";
  }

  let cravingQuestEntry = $derived.by(() => {
    const craving = getCravingQuest(userState.state.completed);
    return {
      displayName: m.quest_craving_name(),
      heartLevel: 99,
      id: craving.questId ?? ("craving_synthetic" as QuestId),
      isCompleted: craving.completed,
      isCraving: true,
      name: m.quest_craving_name(),
      rewardRecipeName: undefined,
      shouldShow: craving.applicable,
      subtitle:
        craving.questId && craving.villager
          ? getName("villagers", craving.villager, locale)
          : undefined,
      villager: craving.villager,
    };
  });

  function completeQuest(quest: { displayName: string; id: QuestId }, quests: { id: QuestId }[]) {
    const completion = userState.completeQuestWithRecipes(quest.id);
    const { newlyAdded } = completion;
    const newState = getQuestState(quest.id);
    const displayName = quest.displayName;
    let message: string;
    if (newState === "obtained") {
      message = m.quest_marked_obtained({ name: displayName });
    } else if (newState === "completed") {
      if (newlyAdded.length === 1) {
        const names = recipeDisplayNames(newlyAdded, locale);
        message = m.quest_marked_completed_with_recipe({ name: displayName, recipe: names[0] });
      } else if (newlyAdded.length > 1) {
        message = m.quest_marked_completed_with_recipes({
          count: newlyAdded.length,
          name: displayName,
        });
      } else {
        message = m.quest_marked_completed({ name: displayName });
      }
    } else {
      message = m.quest_reset({ name: displayName });
    }
    toast(message, {
      cancel: {
        label: m.action_undo(),
        onClick: () => {
          userState.undoQuestWithRecipes(quest.id, completion);
        },
      },
      duration: 5000,
    });
    if (newState === "completed") {
      const questIds = quests.map((q) => q.id);
      if (isQuestsComplete()) {
        celebrateCategory();
      } else if (isQuestTypeComplete(questIds)) {
        celebrate();
      }
    }
  }
</script>

<SpoilerGuardDialog guard={spoilerGuard} />

{#each typeOrder as questType (questType)}
  {@const categoryRevealed = isVisible(
    trackerData.categoryVisibility[questType],
    userState.progressionState,
  )}
  {@const chainOrder = trackerData.questOrder[questType] ?? null}
  {@const quests = Object.entries(trackerData.quests[questType])
    .filter(([id]) => !PREGNANCY_QUEST_IDS.has(id as QuestId))
    .map(([id, q]) => {
      const fetchQuest = questType === "fetch" ? (q as FetchQuest) : undefined;
      const heartQuest = questType === "heart" ? (q as HeartQuest) : undefined;
      const rewardRecipeName = fetchQuest?.rewardRecipeId
        ? getName("recipes", fetchQuest.rewardRecipeId, locale)
        : undefined;
      return {
        displayName: fetchQuest
          ? getName("items", fetchQuest.itemId, locale)
          : displayQuestName(getName("quests", id as QuestId, locale), questType, locale),
        heartLevel: heartQuest?.heartLevel,
        id: id as QuestId,
        isCompleted: false,
        isCraving: false,
        name: getName("quests", id as QuestId, locale),
        rewardRecipeName,
        shouldShow: true,
        subtitle: undefined as string | undefined,
        villager: fetchQuest?.villager ?? heartQuest?.villager,
      };
    })
    .concat(questType === "heart" ? [cravingQuestEntry] : [])
    .sort((a, b) => {
      if (chainOrder) {
        const aIdx = chainOrder.indexOf(a.id);
        const bIdx = chainOrder.indexOf(b.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
      }
      if (questType === "heart") {
        if (a.isCraving !== b.isCraving) return a.isCraving ? 1 : -1;
        const villagerA = a.villager ? getName("villagers", a.villager, locale) : "";
        const villagerB = b.villager ? getName("villagers", b.villager, locale) : "";
        const villagerCmp = nameCollator(locale).compare(villagerA, villagerB);
        if (villagerCmp !== 0) return villagerCmp;
        return (a.heartLevel ?? 0) - (b.heartLevel ?? 0);
      }
      if (questType === "fetch") {
        const nameCmp = nameCollator(locale).compare(a.displayName, b.displayName);
        if (nameCmp !== 0) return nameCmp;
        const villagerA = a.villager ? getName("villagers", a.villager, locale) : "";
        const villagerB = b.villager ? getName("villagers", b.villager, locale) : "";
        return nameCollator(locale).compare(villagerA, villagerB);
      }
      return nameCollator(locale).compare(a.displayName, b.displayName);
    })}
  {@const duplicateNames = findDuplicateNames(quests)}
  {@const visibleQuests = quests.filter((q) => {
    if (q.isCraving) {
      if (!q.shouldShow) return false;
      return q.isCompleted ? userState.state.showCompleted : true;
    }
    if (!toolbarState.matchesSourceFilters(questSources(questType, q.id))) return false;
    const done = getQuestState(q.id) === "completed";
    return done ? userState.state.showCompleted : true;
  })}
  {#if quests.length > 0}
    <SpoilerSection name={typeLabel(questType)} revealed={categoryRevealed}>
      {#if visibleQuests.length > 0}
        {@const shownQuests = quests.filter(
          (q) =>
            (q.isCraving ? q.shouldShow : true) &&
            toolbarState.matchesSourceFilters(q.isCraving ? [] : questSources(questType, q.id)),
        )}
        <ExpandableSection
          {locale}
          count={shownQuests.filter((q) =>
            q.isCraving ? q.isCompleted : getQuestState(q.id) === "completed",
          ).length}
          name={typeLabel(questType)}
          reportCategory="quest-section"
          reportEntityId={questType}
          total={shownQuests.length}
        >
          <TrackerRowList getKey={(quest) => quest.id} items={visibleQuests}>
            {#snippet row(quest)}
              {#if quest.isCraving}
                {@const cravingState = quest.isCompleted ? "completed" : "none"}
                {@const cravingNameVisible = !!quest.villager}
                <TrackerRow
                  display={questRowDisplay(cravingState, cravingNameVisible)}
                  lookups={baseLookups}
                  name={quest.displayName}
                  reportCategory="craving-quest"
                  reportEntityId={quest.id}
                  sources={[]}
                  subtitle={quest.subtitle}
                  onToggle={() => {
                    if (quest.villager && cravingQuestEntry.id !== "craving_synthetic") {
                      completeQuest(quest, quests);
                    }
                  }}
                />
              {:else}
                {@const questState = getQuestState(quest.id)}
                {@const nameVisible = questNameVisible(questType, quest.id)}
                <TrackerRow
                  display={questRowDisplay(questState, nameVisible)}
                  lookups={{
                    ...baseLookups,
                    entityVisibility: questVisibility(questType, quest.id),
                  }}
                  name={quest.displayName}
                  reportCategory="quest"
                  reportEntityId={quest.id}
                  sources={questSources(questType, quest.id)}
                  subtitle={questSubtitle(quest, questType, duplicateNames)}
                  onToggle={() => {
                    if (nameVisible || questState !== "none") {
                      completeQuest(quest, quests);
                    } else {
                      spoilerGuard.guard(questVisibility(questType, quest.id), () => {
                        completeQuest(quest, quests);
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
  {/if}
{/each}

<AllCompleted isAllCompleted={isQuestsComplete()} />
