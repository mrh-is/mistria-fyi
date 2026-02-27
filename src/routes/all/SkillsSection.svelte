<script lang="ts">
  import SkillsContent from "$lib/components/skills-content.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { getSkillsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SectionHeader from "./SectionHeader.svelte";

  let progress = $derived(
    getSkillsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <div class="flex flex-col gap-1">
    <SectionHeader category={CATEGORY_BY_KEY.skills} {progress} />
    <SkillsContent />
  </div>
{/if}
