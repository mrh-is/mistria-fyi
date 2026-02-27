<script lang="ts">
  import MinesContent from "$lib/components/mines-content.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { getMinesProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SectionHeader from "./SectionHeader.svelte";

  let progress = $derived(
    getMinesProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <div class="flex flex-col gap-1">
    <SectionHeader category={CATEGORY_BY_KEY.mines} {progress} />
    <MinesContent compact={true} />
  </div>
{/if}
