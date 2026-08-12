<script lang="ts">
  import MinesContent from "$lib/components/mines-content.svelte";
  import PageHeader from "$lib/components/page-header.svelte";
  import { CATEGORY_BY_KEY, categoryColor } from "$lib/data/categories.js";
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

<PageHeader
  icon={{ color: categoryColor(CATEGORY_BY_KEY.mines.key), component: CATEGORY_BY_KEY.mines.icon }}
  title={CATEGORY_BY_KEY.mines.name}
  {progress}
/>

<MinesContent defaultOpen={true} />
