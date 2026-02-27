<script lang="ts">
  import CategoryHeader from "$lib/components/category-header.svelte";
  import MinesContent from "$lib/components/mines-content.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { getMinesProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getMinesProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

<CategoryHeader category={CATEGORY_BY_KEY.mines} {progress} />

<MinesContent defaultOpen={true} />
