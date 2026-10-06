<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import { categoryForKey } from "#lib/data/categories.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { CategoryKey } from "#lib/data/categories.js";
  import type { CategoryProgress } from "#lib/engine/progress.js";

  let {
    key,
    progress,
  }: {
    key: CategoryKey;
    progress: CategoryProgress;
  } = $props();

  const { color, name } = $derived(categoryForKey(key, page.data.locale));
</script>

<div
  class="sticky z-[var(--z-section-header)] -mx-4 flex items-center gap-2 bg-background px-6 py-2"
  style="top: var(--section-top, 0px); --header-color: var(--{color})"
>
  <Icon.Category category={key} class="size-4 text-(--header-color)" />
  <h2 id="category-{key}" class="flex-1 text-sm font-semibold tracking-wide">{name}</h2>
  <span class="text-sm text-muted-foreground"
    >{formatNumber(progress.completed, page.data.locale)}/{formatNumber(
      progress.total,
      page.data.locale,
    )}</span
  >
</div>
