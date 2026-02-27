<script lang="ts">
  import CategoryHeader from "$lib/components/category-header.svelte";
  import QuestsContent from "$lib/components/quests-content.svelte";
  import { CATEGORY_BY_KEY } from "$lib/data/categories.js";
  import { getQuestsProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getQuestsProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

<CategoryHeader category={CATEGORY_BY_KEY.quests} {progress} />

<QuestsContent />
