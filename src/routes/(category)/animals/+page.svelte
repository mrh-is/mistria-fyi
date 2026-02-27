<script lang="ts">
  import AnimalsContent from "$lib/components/animals-content.svelte";
  import CategoryHeader from "$lib/components/category-header.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { getAnimalsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getAnimalsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

<CategoryHeader category={CATEGORY_BY_KEY.animals} {progress} />

<AnimalsContent />
