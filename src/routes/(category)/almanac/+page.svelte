<script lang="ts">
  import AlmanacContent from "$lib/components/almanac-content.svelte";
  import CategoryHeader from "$lib/components/category-header.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { getAlmanacProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getAlmanacProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

<CategoryHeader category={CATEGORY_BY_KEY.almanac} {progress} />

<AlmanacContent />
