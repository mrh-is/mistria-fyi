<script lang="ts">
  import PageHeader from "$lib/components/page-header.svelte";
  import RecipesContent from "$lib/components/recipes-content.svelte";
  import { CATEGORY_BY_KEY, categoryColor } from "$lib/data/categories.js";
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

<PageHeader
  icon={{
    color: categoryColor(CATEGORY_BY_KEY.recipes.key),
    component: CATEGORY_BY_KEY.recipes.icon,
  }}
  title={CATEGORY_BY_KEY.recipes.name}
  {progress}
/>

<RecipesContent />
