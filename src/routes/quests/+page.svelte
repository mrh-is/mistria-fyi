<script lang="ts">
  import { ScrollText } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getQuestsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { displayQuestName } from "$lib/utils/format.js";

  import type { QuestId } from "$lib/types/tracker-data.js";

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
</script>

<div class="flex flex-col gap-4 p-4">
  <CategoryHeader icon={ScrollText} name="Quests" {progress} />

  {#each typeOrder as questType (questType)}
    {@const quests = Object.entries(trackerData.quests[questType] ?? {})
      .map(([id, q]) => ({
        displayName: displayQuestName(q.name, questType),
        id: id as QuestId,
        name: q.name,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))}
    {@const completedCount = quests.filter((q) =>
      userState.state.completed.quests.has(q.id),
    ).length}
    {@const visibleQuests = quests.filter((q) => {
      const done = userState.state.completed.quests.has(q.id);
      return done ? userState.state.showCompleted : true;
    })}
    {#if visibleQuests.length > 0}
      <ExpandableSection
        count={completedCount}
        name={typeLabels[questType] ?? questType}
        total={quests.length}
      >
        {#each visibleQuests as quest (quest.id)}
          {@const completed = userState.state.completed.quests.has(quest.id)}
          <div
            class="flex items-center gap-2 rounded-md px-2 py-1 {completed
              ? 'line-through opacity-40'
              : ''}"
          >
            <Checkbox
              checked={completed}
              onCheckedChange={() => {
                userState.toggleQuest(quest.id);
              }}
            />
            <span class="text-sm">{quest.displayName}</span>
          </div>
        {/each}
      </ExpandableSection>
    {/if}
  {/each}
</div>
