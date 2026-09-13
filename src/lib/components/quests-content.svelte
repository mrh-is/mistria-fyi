<script lang="ts">
  import { toast } from "svelte-sonner";

  import ConfirmSpoilerDialog from "$lib/components/confirm-spoiler-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import SpoilerSection from "$lib/components/spoiler-section.svelte";
  import TrackerRowStack from "$lib/components/tracker-row-stack.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData, trackerIndex } from "$lib/data/index.js";
  import { recipeDisplayNames } from "$lib/engine/quest-rewards.js";
  import { getMarriedNpc } from "$lib/engine/relationships.js";
  import { isEntityNameVisible, isVisible } from "$lib/engine/visibility.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordEntries } from "$lib/utils";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { displayQuestName } from "$lib/utils/format.js";
  import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";
  import { registerSourceFilters } from "$lib/utils/source-filter-registration.svelte.js";
  import { createSpoilerGuard } from "$lib/utils/spoiler-guard.svelte.js";

  import AllCompleted from "./all-completed.svelte";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { QuestState } from "$lib/stores/user-state.svelte.js";
  import type { Source } from "$lib/types/acquisition";
  import type {
    FetchQuest,
    HeartQuest,
    NpcId,
    QuestId,
    QuestType,
  } from "$lib/types/tracker-data.js";
  import type { VisibilityCondition } from "$lib/types/visibility.js";

  const pregnancyQuestIds = new Set(
    Object.values(trackerData.pregnancyQuestByNpc).filter((id): id is QuestId => id !== undefined),
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

  let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds));

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

  function questNameVisible(questType: QuestType, questId: QuestId): boolean {
    return isEntityNameVisible(questVisibility(questType, questId), userState.progressionState);
  }

  function questVisibility(
    questType: QuestType,
    questId: QuestId,
  ): undefined | VisibilityCondition {
    return trackerData.quests[questType][questId].visibility;
  }

  function isQuestTypeComplete(questIds: QuestId[]): boolean {
    return questIds.every((id) => getQuestState(id) === "completed");
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

  function isCravingQuestComplete(): boolean {
    const marriedNpc = getMarriedNpc(userState.state.completed.npcRelationships);
    if (!marriedNpc) return false;
    if (!(marriedNpc in trackerData.pregnancyQuestByNpc)) return true;
    if (userState.state.completed.childChoice === "no") return true;
    const questId = trackerData.pregnancyQuestByNpc[marriedNpc];
    return questId ? getQuestState(questId) === "completed" : true;
  }

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

  function questRowDisplay(questState: QuestState, nameVisible: boolean): TrackerRowDisplay {
    if (!nameVisible) return { mode: "spoilered" };
    if (questState === "completed") return { mode: "completed" };
    if (questState === "obtained") return { mode: "obtained" };
    return { mode: "visible" };
  }

  function questSubtitle(
    quest: { displayName: string; npc?: NpcId; rewardRecipeName?: string },
    questType: QuestType,
    duplicateNames: Set<string>,
  ): string | undefined {
    const { displayName, npc, rewardRecipeName } = quest;
    if (!npc) return undefined;
    if (questType === "fetch" || questType === "heart" || duplicateNames.has(displayName)) {
      const npcName = trackerData.npcs[npc].name;
      if (duplicateNames.has(displayName) && rewardRecipeName) {
        return `${npcName} · ${rewardRecipeName}`;
      }
      return npcName;
    }
  }

  const typeLabels: Record<QuestType, string> = {
    cooking: "Cooking Challenges",
    crown: "Crown Quests",
    fetch: "Fetch Quests",
    heart: "Heart Quests",
    mission: "Mission Quests",
    story: "Story Quests",
  };

  const typeOrder = ["story", "heart", "fetch", "crown", "mission", "cooking"] as QuestType[];

  registerSourceFilters("quests", () => trackerIndex.categorySourceTypes.quests);

  function getQuestState(id: QuestId): QuestState {
    return userState.state.completed.questStates[id] ?? "none";
  }

  let cravingQuestEntry = $derived.by(() => {
    const marriedNpc = getMarriedNpc(userState.state.completed.npcRelationships);
    const isWife = marriedNpc ? marriedNpc in trackerData.pregnancyQuestByNpc : false;
    const activeQuestId = marriedNpc ? trackerData.pregnancyQuestByNpc[marriedNpc] : undefined;

    const shouldShow = !marriedNpc || (isWife && userState.state.completed.childChoice !== "no");

    const subtitle = activeQuestId && marriedNpc ? trackerData.npcs[marriedNpc].name : undefined;

    const isCompleted = activeQuestId ? getQuestState(activeQuestId) === "completed" : false;

    return {
      displayName: "A Craving",
      heartLevel: 99,
      id: (activeQuestId ?? "craving_synthetic") as QuestId,
      isCompleted,
      isCraving: true,
      name: "A Craving",
      npc: marriedNpc ?? undefined,
      rewardRecipeName: undefined,
      shouldShow,
      subtitle,
    };
  });

  function completeQuest(quest: { displayName: string; id: QuestId }, quests: { id: QuestId }[]) {
    const newlyAdded = userState.completeQuestWithRecipes(quest.id);
    const newState = getQuestState(quest.id);
    const displayName = quest.displayName;
    let message: string;
    if (newState === "obtained") {
      message = `Marked "${displayName}" obtained`;
    } else if (newState === "completed") {
      if (newlyAdded.length === 1) {
        const names = recipeDisplayNames(newlyAdded);
        message = `Marked "${displayName}" completed and unlocked "${names[0]}"`;
      } else if (newlyAdded.length > 1) {
        message = `Marked "${displayName}" completed and unlocked ${newlyAdded.length.toString()} recipes`;
      } else {
        message = `Marked "${displayName}" completed`;
      }
    } else {
      message = `Reset "${displayName}"`;
    }
    toast(message, {
      cancel: {
        label: "Undo",
        onClick: () => {
          userState.undoQuestWithRecipes(quest.id, newlyAdded);
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
        ? trackerData.recipes[fetchQuest.rewardRecipeId].name
        : undefined;
      return {
        displayName: fetchQuest
          ? trackerData.items[fetchQuest.itemId].name
          : displayQuestName(q.name, questType),
        heartLevel: heartQuest?.heartLevel,
        id: id as QuestId,
        isCompleted: false,
        isCraving: false,
        name: q.name,
        npc: fetchQuest?.npc ?? heartQuest?.npc,
        rewardRecipeName,
        shouldShow: true,
        subtitle: undefined as string | undefined,
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
        const npcA = a.npc ? trackerData.npcs[a.npc].name : "";
        const npcB = b.npc ? trackerData.npcs[b.npc].name : "";
        const npcCmp = npcA.localeCompare(npcB);
        if (npcCmp !== 0) return npcCmp;
        return (a.heartLevel ?? 0) - (b.heartLevel ?? 0);
      }
      if (questType === "fetch") {
        const nameCmp = a.displayName.localeCompare(b.displayName);
        if (nameCmp !== 0) return nameCmp;
        const npcA = a.npc ? trackerData.npcs[a.npc].name : "";
        const npcB = b.npc ? trackerData.npcs[b.npc].name : "";
        return npcA.localeCompare(npcB);
      }
      return a.displayName.localeCompare(b.displayName);
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
    <SpoilerSection name={typeLabels[questType]} revealed={categoryRevealed}>
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
          name={typeLabels[questType]}
          reportCategory="quest section"
          reportEntityId={questType}
          total={shownQuests.length}
        >
          <TrackerRowStack>
            {#each visibleQuests as quest (quest.id)}
              {#if quest.isCraving}
                {@const cravingState = quest.isCompleted ? "completed" : "none"}
                {@const cravingNameVisible = !!quest.npc}
                <TrackerRow
                  display={questRowDisplay(cravingState, cravingNameVisible)}
                  lookups={baseLookups}
                  name={quest.displayName}
                  reportCategory="craving quest"
                  reportEntityId={quest.id}
                  sources={[]}
                  subtitle={quest.subtitle}
                  onToggle={() => {
                    if (quest.npc && cravingQuestEntry.id !== "craving_synthetic") {
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
          No items match the current filters
        </p>
      {/if}
    </SpoilerSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isQuestsComplete()} />
