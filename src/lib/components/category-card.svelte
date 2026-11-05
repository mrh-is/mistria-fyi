<script lang="ts">
  import CategoryStripe from "#lib/components/category-stripe.svelte";
  import { categoryForKey } from "#lib/data/categories.js";
  import { page } from "$app/state";

  import type { CategoryKey } from "#lib/engine/categories.js";
  import type { CategoryProgress } from "#lib/engine/progress.js";

  let {
    key,
    progress,
    quiet = false,
  }: { key: CategoryKey; progress: CategoryProgress; quiet?: boolean } = $props();

  const { color, description, href, name } = $derived(categoryForKey(key, page.data.locale));
</script>

<CategoryStripe
  {color}
  categoryTotal={progress.total}
  completed={progress.completed}
  {description}
  {href}
  icon={key}
  {name}
  {quiet}
  todo={progress.todo}
/>
