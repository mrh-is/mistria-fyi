<script lang="ts">
  import CategoryHeader from "$lib/components/category-header.svelte";
  import MuseumContent from "$lib/components/museum-content.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
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

<CategoryHeader category={CATEGORY_BY_KEY.museum} {progress} />

<MuseumContent />
