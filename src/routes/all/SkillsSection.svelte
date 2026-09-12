<script lang="ts">
  import SkillsContent from "$lib/components/skills-content.svelte";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SectionHeader from "./SectionHeader.svelte";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  const { progress }: { progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section aria-labelledby="category-skills" style="--primary: var(--cat-skills)">
    <SectionHeader key="skills" {progress} />
    <SkillsContent compact />
  </section>
{/if}
