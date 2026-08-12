<script lang="ts">
  import AnimalsContent from "$lib/components/animals-content.svelte";
  import PageHeader from "$lib/components/page-header.svelte";
  import { CATEGORY_BY_KEY, categoryColor } from "$lib/data/categories.js";
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

<PageHeader
  icon={{
    color: categoryColor(CATEGORY_BY_KEY.animals.key),
    component: CATEGORY_BY_KEY.animals.icon,
  }}
  title={CATEGORY_BY_KEY.animals.name}
  {progress}
/>

<AnimalsContent />
