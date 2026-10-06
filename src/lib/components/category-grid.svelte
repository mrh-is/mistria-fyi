<script lang="ts">
  import CategoryCard from "#lib/components/category-card.svelte";
  import { Icon } from "#lib/components/icon/index.js";
  import { CATEGORY_KEYS, sortCategoryKeysByName } from "#lib/data/categories.js";
  import * as m from "#lib/paraglide/messages.js";
  import { page } from "$app/state";

  import type { AllProgress } from "#lib/engine/progress.js";

  let { progress }: { progress: AllProgress } = $props();

  let activeCategories = $derived(
    sortCategoryKeysByName(
      CATEGORY_KEYS.filter((key) => {
        const p = progress[key];
        return p.total === 0 || p.completed < p.total;
      }),
      page.data.locale,
    ),
  );

  let completedCategories = $derived(
    sortCategoryKeysByName(
      CATEGORY_KEYS.filter((key) => {
        const p = progress[key];
        return p.total > 0 && p.completed >= p.total;
      }),
      page.data.locale,
    ),
  );
</script>

<div class="flex flex-col gap-5">
  {#if activeCategories.length > 0}
    <ul class="flex flex-col gap-1.5" aria-label={m.home_active_categories_label()}>
      {#each activeCategories as key (key)}
        <li><CategoryCard {key} progress={progress[key]} /></li>
      {/each}
    </ul>
  {/if}

  {#if completedCategories.length > 0}
    <section class="flex flex-col gap-2">
      <div
        class="flex items-center gap-1.5 px-1 font-controls text-2xs tracking-[0.14em] text-(--color-progress-complete) uppercase"
      >
        <Icon.Category category="complete" class="size-3.5" />
        <h2>{m.home_completed_heading()}</h2>
      </div>
      <ul class="flex flex-col gap-1.5" aria-label={m.home_completed_categories_label()}>
        {#each completedCategories as key (key)}
          <li><CategoryCard {key} progress={progress[key]} /></li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
