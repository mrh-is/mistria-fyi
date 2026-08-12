<script lang="ts">
  import CosmeticsContent from "$lib/components/cosmetics-content.svelte";
  import PageHeader from "$lib/components/page-header.svelte";
  import { CATEGORY_BY_KEY, categoryColor } from "$lib/data/categories.js";
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

<PageHeader
  icon={{
    color: categoryColor(CATEGORY_BY_KEY.cosmetics.key),
    component: CATEGORY_BY_KEY.cosmetics.icon,
  }}
  title={CATEGORY_BY_KEY.cosmetics.name}
  {progress}
/>

<CosmeticsContent />
