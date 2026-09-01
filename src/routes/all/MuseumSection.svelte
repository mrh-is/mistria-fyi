<script lang="ts">
  import MuseumContent from "$lib/components/museum-content.svelte";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SectionHeader from "./SectionHeader.svelte";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  const { progress }: { progress: CategoryProgress } = $props();
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section aria-labelledby="category-museum" class="flex flex-col gap-1">
    <SectionHeader key="museum" {progress} />
    <MuseumContent />
  </section>
{/if}
