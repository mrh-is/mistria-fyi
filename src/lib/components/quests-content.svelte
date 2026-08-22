<script lang="ts">
  import { toast } from "svelte-sonner";

  import ConfirmSpoilerDialog from "$lib/components/confirm-spoiler-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import SpoilerSection from "$lib/components/spoiler-section.svelte";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { recipeDisplayNames } from "$lib/engine/quest-rewards.js";
  import { isEntityNameVisible, isVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { displayQuestName } from "$lib/utils/format.js";
  import { createSpoilerGuard } from "$lib/utils/spoiler-guard.svelte.js";

  import AllCompleted from "./all-completed.svelte";

  import type { TrackerRowDisplay } from "$lib/components/tracker-row.svelte";
  import type { QuestState } from "$lib/stores/user-state.svelte.js";
  import type { FetchQuest, NpcId, QuestId, QuestType } from "$lib/types/tracker-data.js";
  import type { VisibilityCondition } from "$lib/types/visibility.js";

  const spoilerGuard = createSpoilerGuard();

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
    return typeOrder.every((type) =>
      Object.keys(trackerData.quests[type]).every(
        (id) => getQuestState(id as QuestId) === "completed",
      ),
    );
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

  function npcSubtitle(
    npc: NpcId | undefined,
    questType: QuestType,
    displayName: string,
    duplicateNames: Set<string>,
  ): string | undefined {
    if (!npc) return undefined;
    if (questType === "fetch" || duplicateNames.has(displayName)) {
      return trackerData.npcs[npc].name;
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

  function getQuestState(id: QuestId): QuestState {
    return userState.state.completed.questStates[id] ?? "none";
  }

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
    .map(([id, q]) => ({
      displayName: displayQuestName(q.name, questType),
      id: id as QuestId,
      name: q.name,
      npc: questType === "fetch" ? (q as FetchQuest).npc : undefined,
    }))
    .sort((a, b) => {
      if (chainOrder) {
        return chainOrder.indexOf(a.id) - chainOrder.indexOf(b.id);
      }
      return a.displayName.localeCompare(b.displayName);
    })}
  {@const duplicateNames = findDuplicateNames(quests)}
  {@const visibleQuests = quests.filter((q) => {
    const done = getQuestState(q.id) === "completed";
    return done ? userState.state.showCompleted : true;
  })}
  {#if quests.length > 0}
    <SpoilerSection revealed={categoryRevealed}>
      {#if visibleQuests.length > 0}
        <ExpandableSection
          count={quests.filter((q) => getQuestState(q.id) === "completed").length}
          name={typeLabels[questType]}
          total={quests.length}
        >
          {#each visibleQuests as quest (quest.id)}
            {@const questState = getQuestState(quest.id)}
            {@const nameVisible = questNameVisible(questType, quest.id)}
            <TrackerRow
              display={questRowDisplay(questState, nameVisible)}
              name={quest.displayName}
              subtitle={nameVisible
                ? npcSubtitle(quest.npc, questType, quest.displayName, duplicateNames)
                : undefined}
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
          {/each}
        </ExpandableSection>
      {/if}
    </SpoilerSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isQuestsComplete()} />
