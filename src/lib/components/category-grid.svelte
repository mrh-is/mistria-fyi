<script lang="ts">
  import CategoryCard from "$lib/components/category-card.svelte";
  import { Icon } from "$lib/components/icon/index.js";
  import { CATEGORY_KEYS, sortCategoryKeysByName } from "$lib/data/categories.js";

  import type { AllProgress } from "$lib/engine/progress.js";

  let { progress }: { progress: AllProgress } = $props();

  let activeCategories = $derived(
    sortCategoryKeysByName(
      CATEGORY_KEYS.filter((key) => {
        const p = progress[key];
        return p.total === 0 || p.completed < p.total;
      }),
    ),
  );

  let completedCategories = $derived(
    sortCategoryKeysByName(
      CATEGORY_KEYS.filter((key) => {
        const p = progress[key];
        return p.total > 0 && p.completed >= p.total;
      }),
    ),
  );
</script>

<div class="flex flex-col gap-5">
  {#if activeCategories.length > 0}
    <ul class="flex flex-col gap-1.5" aria-label="Categories in progress">
      {#each activeCategories as key (key)}
        <li><CategoryCard {key} progress={progress[key]} /></li>
      {/each}
    </ul>
  {/if}

  {#if completedCategories.length > 0}
    <section class="flex flex-col gap-2">
      <div
        class="flex items-center gap-1.5 px-1 font-controls text-[11px] tracking-[0.14em] text-amber-800 uppercase dark:text-amber-300"
      >
        <Icon.Category category="complete" class="size-3.5" />
        <h2>Completed</h2>
      </div>
      <ul class="flex flex-col gap-1.5" aria-label="Completed categories">
        {#each completedCategories as key (key)}
          <li><CategoryCard {key} progress={progress[key]} /></li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
