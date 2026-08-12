<script lang="ts">
  import PageHeader from "$lib/components/page-header.svelte";
  import QuestsContent from "$lib/components/quests-content.svelte";
  import { CATEGORY_BY_KEY, categoryColor } from "$lib/data/categories.js";
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

<PageHeader
  icon={{
    color: categoryColor(CATEGORY_BY_KEY.quests.key),
    component: CATEGORY_BY_KEY.quests.icon,
  }}
  title={CATEGORY_BY_KEY.quests.name}
  {progress}
/>

<QuestsContent />
