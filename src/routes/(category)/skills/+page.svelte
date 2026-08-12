<script lang="ts">
  import PageHeader from "$lib/components/page-header.svelte";
  import SkillsContent from "$lib/components/skills-content.svelte";
  import { CATEGORY_BY_KEY, categoryColor } from "$lib/data/categories.js";
  import { getSkillsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getSkillsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

<PageHeader
  icon={{
    color: categoryColor(CATEGORY_BY_KEY.skills.key),
    component: CATEGORY_BY_KEY.skills.icon,
  }}
  title={CATEGORY_BY_KEY.skills.name}
  {progress}
/>

<SkillsContent />
