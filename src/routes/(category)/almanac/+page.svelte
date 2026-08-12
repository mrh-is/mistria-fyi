<script lang="ts">
  import AlmanacContent from "$lib/components/almanac-content.svelte";
  import PageHeader from "$lib/components/page-header.svelte";
  import { CATEGORY_BY_KEY, categoryColor } from "$lib/data/categories.js";
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

<PageHeader
  icon={{
    color: categoryColor(CATEGORY_BY_KEY.almanac.key),
    component: CATEGORY_BY_KEY.almanac.icon,
  }}
  title={CATEGORY_BY_KEY.almanac.name}
  {progress}
/>

<AlmanacContent />
