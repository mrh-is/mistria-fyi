<script lang="ts">
  import CategoryHeader from "$lib/components/category-header.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { trackerData } from "$lib/data/index.js";
  import { getSkillsProgress } from "$lib/engine/progress.js";
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

<!-- Override --primary so checkboxes/progress bars inherit category color -->
<div class="flex flex-col gap-4 px-4 pb-4" style="--primary: var(--cat-skills)">
  <CategoryHeader
    color={CATEGORY_BY_KEY.skills.color}
    icon={CATEGORY_BY_KEY.skills.icon}
    name={CATEGORY_BY_KEY.skills.name}
    {progress}
  />

  <div class="flex flex-col gap-3">
    {#each skills as skill (skill.id)}
      {@const level = userState.state.completed.skillLevels[skill.id as string] ?? 0}
      {#if level >= 60 ? userState.state.showCompleted : true}
        <SkillRow id={skill.id} name={skill.name} />
      {/if}
    {/each}
  </div>
</div>
