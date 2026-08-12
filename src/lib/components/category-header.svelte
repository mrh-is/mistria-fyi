<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { Icon } from "$lib/components/icon/index.js";
  import { categoryColor, type CategoryMeta } from "$lib/data/categories.js";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  let {
    category,
    progress,
  }: {
    category: CategoryMeta;
    progress: CategoryProgress;
  } = $props();

  const color = $derived(categoryColor(category.key));

  let pct = $derived(
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0,
  );
</script>

<div
  class="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-border/50 bg-background px-4 pt-safe-or-4 pb-3"
  style={color ? `--header-color: var(--${color})` : undefined}
>
  <a
    class="-ml-3 flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"
    href={resolve("/")}
    aria-label="Back to home"
  >
    <ArrowLeft class="size-5" />
  </a>
  <Icon.Category
    category={category.key}
    class={color ? "size-5 text-(--header-color)" : "size-5 text-muted-foreground"}
  />
  <h1 class="flex-1 text-xl font-semibold">{category.name}</h1>
  <span class="shrink-0 text-sm text-muted-foreground">
    <span class="sm:hidden">{pct}%</span>
    <span class="hidden sm:inline">{progress.completed}/{progress.total}</span>
  </span>
</div>
