<script lang="ts">
  import { Circle, CircleCheckBig, CircleDashed } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { getQuestsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { displayQuestName } from "$lib/utils/format.js";

  import type { QuestState } from "$lib/stores/user-state.svelte.js";
  import type { NpcId, QuestId } from "$lib/types/tracker-data.js";

  /** Build a set of display names that appear more than once in a quest group */
  function findDuplicateNames(entries: Array<{ displayName: string }>): Set<string> {
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

  let progress = $derived(
    getQuestsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  const typeLabels: Record<string, string> = {
    crown_quests: "Crown Quests",
    fetch_quests: "Fetch Quests",
    heart_quests: "Heart Quests",
    story_quests: "Story Quests",
  };

  const typeOrder = ["story_quests", "heart_quests", "fetch_quests", "crown_quests"];

  function getQuestState(id: QuestId): QuestState {
    return userState.state.completed.questStates[id as string] ?? "none";
  }
</script>

<!-- Override --primary so checkboxes/progress bars inherit category color -->
<div class="flex flex-col gap-4 px-4 pb-4" style="--primary: var(--cat-quests)">
  <CategoryHeader
    color={CATEGORY_BY_KEY.quests.color}
    icon={CATEGORY_BY_KEY.quests.icon}
    name={CATEGORY_BY_KEY.quests.name}
    {progress}
  />

  {#each typeOrder as questType (questType)}
    {@const quests = Object.entries(trackerData.quests[questType] ?? {})
      .map(([id, q]) => ({
        displayName: displayQuestName(q.name, questType),
        id: id as QuestId,
        name: q.name,
        npc: q.npc,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))}
    {@const duplicateNames = findDuplicateNames(quests)}
    {@const completedCount = quests.filter((q) => getQuestState(q.id) === "completed").length}
    {@const visibleQuests = quests.filter((q) => {
      const done = getQuestState(q.id) === "completed";
      return done ? userState.state.showCompleted : true;
    })}
    {#if visibleQuests.length > 0}
      <ExpandableSection
        count={completedCount}
        name={typeLabels[questType] ?? questType}
        total={quests.length}
      >
        {#each visibleQuests as quest (quest.id)}
          {@const questState = getQuestState(quest.id)}
          <div
            class="flex items-center gap-2 rounded-md px-2 py-1 {questState === 'completed'
              ? 'line-through opacity-40'
              : ''}"
          >
            <button
              class="shrink-0 transition-colors"
              type="button"
              title={questState === "none"
                ? "Not obtained — click to mark obtained"
                : questState === "obtained"
                  ? "Obtained — click to mark completed"
                  : "Completed — click to reset"}
              onclick={() => {
                userState.cycleQuestState(quest.id);
              }}
            >
              {#if questState === "none"}
                <CircleDashed class="text-muted-foreground/50 size-5" />
              {:else if questState === "obtained"}
                <Circle class="size-5 text-amber-500 dark:text-amber-400" />
              {:else}
                <CircleCheckBig class="size-5 text-green-600 dark:text-green-400" />
              {/if}
            </button>
            <span class="min-w-0 flex-1 text-sm">
              {quest.displayName}
              {#if quest.npc && (questType === "fetch_quests" || duplicateNames.has(quest.displayName))}
                <span class="text-muted-foreground text-[10px]">
                  {trackerData.npcs[quest.npc as NpcId].name}
                </span>
              {/if}
            </span>
            {#if questState === "obtained"}
              <span class="text-[10px] text-amber-600 dark:text-amber-400">Active</span>
            {/if}
          </div>
        {/each}
      </ExpandableSection>
    {/if}
  {/each}
</div>
