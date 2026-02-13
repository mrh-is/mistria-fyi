<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { categoryColor, categoryHref } from "$lib/data/categories.js";

  import type { CategoryMeta } from "$lib/data/categories.js";
  import type { CategoryProgress } from "$lib/engine/progress.js";

  let {
    category,
    progress,
  }: {
    category: CategoryMeta;
    progress: CategoryProgress;
  } = $props();

  const Icon = $derived(category.icon);
  const name = $derived(category.name);
  const color = $derived(categoryColor(category.key));
  const href = $derived(categoryHref(category.key));

  // Show available count when filtering is active (filtered < total - completed)
  let displayTotal = $derived(progress.completed + progress.filtered);
  let pct = $derived(displayTotal > 0 ? (progress.completed / displayTotal) * 100 : 0);
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href is a known route path -->
<a class="block" {href} style="--category-color: var(--{color})">
  <Card.Root
    class="hover:bg-accent/30 active:bg-accent/40 gap-0 py-4 transition-colors hover:border-(--category-color)/50"
  >
    <Card.Content class="flex flex-col gap-2 px-4">
      <div class="flex items-center gap-2">
        <Icon class="size-4 shrink-0 text-(--category-color)" />
        <span class="min-w-0 flex-1 text-sm font-medium">{name}</span>
        <span class="text-muted-foreground shrink-0 text-xs">
          <span class="sm:hidden">{Math.round(pct)}%</span>
          <span class="hidden sm:inline">{progress.completed}/{displayTotal}</span>
        </span>
      </div>
      <Progress class="h-1.5" value={pct} {color} />
    </Card.Content>
  </Card.Root>
</a>
