<script lang="ts">
  import { resolve } from "$app/paths";
  import { Icon } from "$lib/components/icon/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { categoryForKey, type CategoryKey } from "$lib/data/categories.js";

  import type { CategoryProgress } from "$lib/engine/progress.js";

  let {
    key,
    progress,
  }: {
    key: CategoryKey;
    progress: CategoryProgress;
  } = $props();

  const { color, href, name } = $derived(categoryForKey(key));

  // Show available count when filtering is active (filtered < total - completed)
  let displayTotal = $derived(progress.completed + progress.filtered);
  let pct = $derived(displayTotal > 0 ? (progress.completed / displayTotal) * 100 : 0);
  let isComplete = $derived(progress.total > 0 && progress.completed >= progress.total);
</script>

<a
  class="block"
  href={resolve(href)}
  aria-label="{name}, {progress.completed} of {displayTotal} completed"
  style="--category-color: var(--{color})"
>
  <Card.Root
    class={[
      "gap-0 py-4 transition-colors",
      isComplete
        ? "border-amber-400/60 bg-amber-50/40 dark:border-amber-500/40 dark:bg-amber-900/15"
        : "hover:border-(--category-color)/50 hover:bg-accent/30 active:bg-accent/40",
    ]}
  >
    <Card.Content class="flex flex-col gap-2 px-4">
      <div class="flex items-center gap-2">
        {#if isComplete}
          <Icon.Category
            category="complete"
            class="size-4 shrink-0 text-yellow-700 dark:text-yellow-400"
          />
        {:else}
          <Icon.Category category={key} class="size-4 shrink-0 text-(--category-color)" />
        {/if}
        <span class="min-w-0 flex-1 text-base font-medium">{name}</span>
        <span class="shrink-0 text-sm text-muted-foreground" aria-hidden="true">
          {#if isComplete}
            <span class="font-medium text-yellow-700 dark:text-yellow-400">100%</span>
          {:else}
            <span class="sm:hidden">{Math.round(pct)}%</span>
            <span class="hidden sm:inline">{progress.completed}/{displayTotal}</span>
          {/if}
        </span>
      </div>
      {#if isComplete}
        <div
          class="h-1.5 rounded-full bg-amber-400/80 dark:bg-amber-500/60"
          aria-hidden="true"
        ></div>
      {:else}
        <div aria-hidden="true"><Progress class="h-1.5" value={pct} {color} /></div>
      {/if}
    </Card.Content>
  </Card.Root>
</a>
