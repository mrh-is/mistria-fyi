<script lang="ts">
  import SkillRow from "$lib/components/skill-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { MAX_SKILL_LEVEL } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordToArray } from "$lib/utils";

  let skills = $derived(
    recordToArray(trackerData.skills)
      .map(([id, { name }]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
</script>

<div class="flex flex-col gap-3">
  {#each skills as skill (skill.id)}
    {@const level = userState.state.completed.skillLevels[skill.id] ?? 0}
    {#if level >= MAX_SKILL_LEVEL ? userState.state.showCompleted : true}
      <SkillRow id={skill.id} name={skill.name} />
    {/if}
  {/each}
</div>
