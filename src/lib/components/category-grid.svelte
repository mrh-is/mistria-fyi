<script lang="ts">
  import CategoryCard from "$lib/components/category-card.svelte";
  import { Icon } from "$lib/components/icon/index.js";
  import { CATEGORIES } from "$lib/data/categories.js";
  import { getAllProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let progress = $derived(
    getAllProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let activeCategories = $derived(
    CATEGORIES.filter((cat) => {
      const p = progress[cat.key];
      return p.total === 0 || p.completed < p.total;
    }),
  );

  let completedCategories = $derived(
    CATEGORIES.filter((cat) => {
      const p = progress[cat.key];
      return p.total > 0 && p.completed >= p.total;
    }),
  );
</script>

<div class="flex flex-col gap-4">
  {#if activeCategories.length > 0}
    <div class="grid grid-cols-2 gap-2">
      {#each activeCategories as cat (cat.key)}
        <CategoryCard category={cat} progress={progress[cat.key]} />
      {/each}
    </div>
  {/if}

  {#if completedCategories.length > 0}
    <div class="flex flex-col gap-2">
      <div
        class="flex items-center gap-1.5 text-sm font-medium text-yellow-700 dark:text-yellow-400"
      >
        <Icon.Category category="complete" class="size-3.5" />
        <span>Completed</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        {#each completedCategories as cat (cat.key)}
          <CategoryCard category={cat} progress={progress[cat.key]} />
        {/each}
      </div>
    </div>
  {/if}
</div>
