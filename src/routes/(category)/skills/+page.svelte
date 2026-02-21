<script lang="ts">
  import CategoryHeader from "$lib/components/category-header.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { getSkillsProgress, MAX_SKILL_LEVEL } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SkillRow from "./SkillRow.svelte";

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

<CategoryHeader category={CATEGORY_BY_KEY.skills} {progress} />

<div class="flex flex-col gap-3">
  {#each skills as skill (skill.id)}
    {@const level = userState.state.completed.skillLevels[skill.id as string] ?? 0}
    {#if level >= MAX_SKILL_LEVEL ? userState.state.showCompleted : true}
      <SkillRow id={skill.id} name={skill.name} />
    {/if}
  {/each}
</div>
