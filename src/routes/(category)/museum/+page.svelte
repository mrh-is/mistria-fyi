<script lang="ts">
  import MuseumContent from "$lib/components/museum-content.svelte";
  import PageHeader from "$lib/components/page-header.svelte";
  import { CATEGORY_BY_KEY, categoryColor } from "$lib/data/categories.js";
  import { getMuseumProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getMuseumProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

<PageHeader
  icon={{
    color: categoryColor(CATEGORY_BY_KEY.museum.key),
    component: CATEGORY_BY_KEY.museum.icon,
  }}
  title={CATEGORY_BY_KEY.museum.name}
  {progress}
/>

<MuseumContent />
