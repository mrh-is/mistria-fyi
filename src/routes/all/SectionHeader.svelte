<script lang="ts">
  import { categoryColor, type CategoryMeta } from "$lib/data/categories.js";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  let {
    category,
    progress,
  }: {
    category: CategoryMeta;
    progress: CategoryProgress;
  } = $props();

  const Icon = $derived(category.icon);
  const color = $derived(categoryColor(category.key));
</script>

<div
  class="sticky z-5 -mx-4 flex items-center gap-2 bg-background px-6 py-2"
  style="top: var(--section-top, 0px); --header-color: var(--{color})"
>
  <Icon class="size-4 text-(--header-color)" />
  <span class="flex-1 text-sm font-semibold tracking-wide">{category.name}</span>
  <span class="text-sm text-muted-foreground">{progress.completed}/{progress.total}</span>
</div>
