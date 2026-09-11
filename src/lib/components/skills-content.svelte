<script lang="ts">
  import SkillRow from "$lib/components/skill-row.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { MAX_SKILL_LEVEL } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordEntries } from "$lib/utils";

  let { compact = false }: { compact?: boolean } = $props();

  let skills = $derived(
    recordEntries(trackerData.skills)
      .map(([id, { name }]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
</script>

<ul class="skill-ledger" aria-label="Skills ledger">
  {#each skills as skill (skill.id)}
    {@const level = userState.state.completed.skillLevels[skill.id] ?? 0}
    {#if level >= MAX_SKILL_LEVEL ? userState.state.showCompleted : true}
      <SkillRow {compact} id={skill.id} name={skill.name} />
    {/if}
  {/each}
</ul>

<style>
  .skill-ledger {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
