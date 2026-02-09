<script lang="ts">
  import { Swords } from "@lucide/svelte";

  import CategoryHeader from "$lib/components/category-header.svelte";
  import ItemRow from "$lib/components/item-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { getSkillsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { SkillId } from "$lib/types/tracker-data.js";

  let progress = $derived(
    getSkillsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let skills = $derived(
    Object.entries(trackerData.skills)
      .map(([id, name]) => ({ id: id as SkillId, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
</script>

<div class="flex flex-col gap-4 p-4">
  <CategoryHeader icon={Swords} name="Skills" {progress} />

  <div class="flex flex-col">
    {#each skills as skill (skill.id)}
      {@const completed = userState.state.completed.skills.has(skill.id)}
      {#if completed ? userState.state.showCompleted : true}
        <ItemRow
          {completed}
          itemId={skill.id as never}
          name={skill.name}
          onToggle={() => {
            userState.toggleSkill(skill.id);
          }}
        />
      {/if}
    {/each}
  </div>
</div>
