<script lang="ts">
  import { toast } from "svelte-sonner";

  import ConfirmRedactedDialog from "$lib/components/confirm-redacted-dialog.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import { Icon } from "$lib/components/icon/index.js";
  import TrackerRow from "$lib/components/tracker-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { recipeDisplayNames } from "$lib/engine/quest-rewards.js";
  import { isEntityNameVisible, isVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { displayQuestName } from "$lib/utils/format.js";
  import { createRedactionGuard } from "$lib/utils/redaction-guard.svelte.js";

  import AllCompleted from "./all-completed.svelte";

  import type { QuestState } from "$lib/stores/user-state.svelte.js";
  import type { FetchQuest, QuestId, QuestType } from "$lib/types/tracker-data.js";
  import type { VisibilityCondition } from "$lib/types/visibility.js";

  const redactGuard = createRedactionGuard();

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

{#if redactGuard.condition}
  <ConfirmRedactedDialog
    condition={redactGuard.condition}
    bind:open={redactGuard.open}
    onCancel={() => {
      redactGuard.cancel();
    }}
    onComplete={() => {
      redactGuard.complete();
    }}
    onCompleteAndUpdate={() => {
      redactGuard.completeAndUpdate();
    }}
  />
{/if}

{#each typeOrder as questType (questType)}
  {@const categoryRevealed = isVisible(
    trackerData.categoryVisibility[questType],
    userState.progressionState,
  )}
  {@const chainOrder =
    questType === "crown"
      ? trackerData.questChains.crown
      : questType === "mission"
        ? trackerData.questChains.stillwell
        : questType === "cooking"
          ? trackerData.questChains.tali
          : null}
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
  {#if visibleQuests.length > 0}
    <ExpandableSection
      count={quests.filter((q) => getQuestState(q.id) === "completed").length}
      name={categoryRevealed ? typeLabels[questType] : "Redacted"}
      total={quests.length}
    >
      {#each visibleQuests as quest (quest.id)}
        {@const questState = getQuestState(quest.id)}
        {#if !questNameVisible(questType, quest.id)}
          <TrackerRow
            display={{ mode: "redacted" }}
            name={quest.displayName}
            onToggle={() => {
              if (questState !== "none") {
                completeQuest(quest, quests);
              } else {
                redactGuard.guard(questVisibility(questType, quest.id), () => {
                  completeQuest(quest, quests);
                });
              }
            }}
          />
        {:else}
          <div
            class="flex items-center gap-2 rounded-md px-2 py-1 {questState === 'completed'
              ? 'line-through opacity-40'
              : ''}"
          >
            <button
              class="flex size-11 shrink-0 items-center justify-center rounded-md transition-colors"
              type="button"
              aria-label={questState === "none"
                ? "Not obtained — click to mark obtained"
                : questState === "obtained"
                  ? "Obtained — click to mark completed"
                  : "Completed — click to reset"}
              onclick={() => {
                completeQuest(quest, quests);
              }}
            >
              <Icon.Completion
                state={questState}
                class="size-5 {questState === 'none'
                  ? 'text-muted-foreground/50'
                  : questState === 'obtained'
                    ? 'text-amber-500 dark:text-amber-400'
                    : 'text-green-600 dark:text-green-400'}"
              />
            </button>
            <span class="min-w-0 flex-1 text-base">
              {quest.displayName}
              {#if quest.npc && (questType === "fetch" || duplicateNames.has(quest.displayName))}
                <span class="text-sm text-muted-foreground">
                  {trackerData.npcs[quest.npc].name}
                </span>
              {/if}
            </span>
            {#if questState === "obtained"}
              <span class="text-sm text-amber-600 dark:text-amber-400">Active</span>
            {/if}
          </div>
        {/if}
      {/each}
    </ExpandableSection>
  {/if}
{/each}

<AllCompleted isAllCompleted={isQuestsComplete()} />
