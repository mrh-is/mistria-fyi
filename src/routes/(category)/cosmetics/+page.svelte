<script lang="ts">
  import CategoryHeader from "$lib/components/category-header.svelte";
  import CosmeticsContent from "$lib/components/cosmetics-content.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { getCosmeticsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getCosmeticsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

<CategoryHeader category={CATEGORY_BY_KEY.cosmetics} {progress} />

<CosmeticsContent />
