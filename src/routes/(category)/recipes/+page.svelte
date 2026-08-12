<script lang="ts">
  import CategoryHeader from "$lib/components/category-header.svelte";
  import RecipesContent from "$lib/components/recipes-content.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { getRecipesProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getRecipesProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

<CategoryHeader category={CATEGORY_BY_KEY.recipes} {progress} />

<RecipesContent />
