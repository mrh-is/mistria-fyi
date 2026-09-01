<script lang="ts">
  import AlmanacContent from "$lib/components/almanac-content.svelte";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SectionHeader from "./SectionHeader.svelte";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  const { progress }: { progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section aria-labelledby="category-almanac" class="flex flex-col gap-1">
    <SectionHeader key="almanac" {progress} />
    <AlmanacContent />
  </section>
{/if}
