<script lang="ts">
  import { toast } from "svelte-sonner";

  import ConfirmSpoilerDialog from "#lib/components/confirm-spoiler-dialog.svelte";
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SpoilerSection from "#lib/components/spoiler-section.svelte";
  import TrackerRowStack from "#lib/components/tracker-row-stack.svelte";
  import TrackerRow from "#lib/components/tracker-row.svelte";
  import { trackerData, trackerIndex } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { recipeDisplayNames } from "#lib/engine/quest-rewards.js";
  import { getMarriedVillager } from "#lib/engine/relationships.js";
  import { isEntityNameVisible, isVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { recordEntries } from "#lib/utils.js";
  import { celebrate, celebrateCategory } from "#lib/utils/celebrate.js";
  import { displayQuestName } from "#lib/utils/format.js";
  import { buildBaseSegmentLookups } from "#lib/utils/segment-lookups.js";
  import { registerSourceFilters } from "#lib/utils/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "#lib/utils/spoiler-guard.svelte.js";

  import AllCompleted from "./all-completed.svelte";

  import type { TrackerRowDisplay } from "#lib/components/tracker-row.svelte";
  import type { QuestState } from "#lib/stores/user-state.svelte.js";
  import type { Source } from "#lib/types/acquisition.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type {
    FetchQuest,
    HeartQuest,
    QuestId,
    QuestType,
    VillagerId,
  } from "#lib/types/tracker-data.js";
  import type { VisibilityCondition } from "#lib/types/visibility.js";

  let { locale }: { locale: LocaleCode } = $props();

  const pregnancyQuestIds = new Set(
    Object.values(trackerData.pregnancyQuestByVillager).filter(
      (id): id is QuestId => id !== undefined,
    ),
  );

  const spoilerGuard = createSpoilerGuard();

  let redactedStoreIds = $derived(
    new Set(
      recordEntries(trackerData.stores)
        .filter(
          ([, { visibility }]) => visibility && !isVisible(visibility, userState.progressionState),
        )
        .map(([id]) => id),
    ),
  );

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

  function isCravingQuestComplete(): boolean {
    const marriedVillager = getMarriedVillager(userState.state.completed.villagerRelationships);
    if (!marriedVillager) return false;
    if (!(marriedVillager in trackerData.pregnancyQuestByVillager)) return true;
    if (userState.state.completed.childChoice === "no") return true;
    const questId = trackerData.pregnancyQuestByVillager[marriedVillager];
    return questId ? getQuestState(questId) === "completed" : true;
  }

  function isQuestsComplete(): boolean {
    for (const type of typeOrder) {
      for (const id of Object.keys(trackerData.quests[type]) as QuestId[]) {
        if (pregnancyQuestIds.has(id)) continue;
        if (getQuestState(id) !== "completed") return false;
      }
    }
    if (!isCravingQuestComplete()) return false;
    return true;
  }

  function isQuestTypeComplete(questIds: QuestId[]): boolean {
    return questIds.every((id) => getQuestState(id) === "completed");
  }

  function questNameVisible(questType: QuestType, questId: QuestId): boolean {
    return isEntityNameVisible(questVisibility(questType, questId), userState.progressionState);
  }

  function questRowDisplay(questState: QuestState, nameVisible: boolean): TrackerRowDisplay {
    if (!nameVisible) return { mode: "spoilered" };
    if (questState === "completed") return { mode: "completed" };
    if (questState === "obtained") return { mode: "obtained" };
    return { mode: "visible" };
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
    const marriedVillager = getMarriedVillager(userState.state.completed.villagerRelationships);
    const isWife = marriedVillager
      ? marriedVillager in trackerData.pregnancyQuestByVillager
      : false;
    const activeQuestId = marriedVillager
      ? trackerData.pregnancyQuestByVillager[marriedVillager]
      : undefined;

    const shouldShow =
      !marriedVillager || (isWife && userState.state.completed.childChoice !== "no");

    const subtitle =
      activeQuestId && marriedVillager ? getName("villagers", marriedVillager, locale) : undefined;

    const isCompleted = activeQuestId ? getQuestState(activeQuestId) === "completed" : false;

    return {
      displayName: m.quest_craving_name(),
      heartLevel: 99,
      id: (activeQuestId ?? "craving_synthetic") as QuestId,
      isCompleted,
      isCraving: true,
      name: m.quest_craving_name(),
      rewardRecipeName: undefined,
      shouldShow,
      subtitle,
      villager: marriedVillager ?? undefined,
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

{#if spoilerGuard.condition}
  <ConfirmSpoilerDialog
    condition={spoilerGuard.condition}
    bind:open={spoilerGuard.open}
    onCancel={() => {
      spoilerGuard.cancel();
    }}
    onComplete={() => {
      spoilerGuard.complete();
    }}
    onCompleteAndUpdate={() => {
      spoilerGuard.completeAndUpdate();
    }}
  />
{/if}

{#each typeOrder as questType (questType)}
  {@const categoryRevealed = isVisible(
    trackerData.categoryVisibility[questType],
    userState.progressionState,
  )}
  {@const chainOrder = trackerData.questOrder[questType] ?? null}
  {@const quests = Object.entries(trackerData.quests[questType])
    .filter(([id]) => !pregnancyQuestIds.has(id as QuestId))
    .map(([id, q]) => {
      const fetchQuest = questType === "fetch" ? (q as FetchQuest) : undefined;
      const heartQuest = questType === "heart" ? (q as HeartQuest) : undefined;
      const rewardRecipeName = fetchQuest?.rewardRecipeId
        ? getName("recipes", fetchQuest.rewardRecipeId, locale)
        : undefined;
      return {
        displayName: fetchQuest
          ? getName("items", fetchQuest.itemId, locale)
          : displayQuestName(getName("quests", id as QuestId, locale), questType),
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
          count={shownQuests.filter((q) =>
            q.isCraving ? q.isCompleted : getQuestState(q.id) === "completed",
          ).length}
          name={typeLabel(questType)}
          reportCategory="quest section"
          reportEntityId={questType}
          total={shownQuests.length}
        >
          <TrackerRowStack>
            {#each visibleQuests as quest (quest.id)}
              {#if quest.isCraving}
                {@const cravingState = quest.isCompleted ? "completed" : "none"}
                {@const cravingNameVisible = !!quest.villager}
                <TrackerRow
                  display={questRowDisplay(cravingState, cravingNameVisible)}
                  lookups={baseLookups}
                  name={quest.displayName}
                  reportCategory="craving quest"
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
            {/each}
          </TrackerRowStack>
        </ExpandableSection>
      {:else}
        <p class="py-4 text-center text-sm text-muted-foreground">
          {m.no_items_match_filters()}
        </p>
      {/if}
    </SpoilerSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isQuestsComplete()} />
