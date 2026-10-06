<script lang="ts">
  import CategoryStripe from "#lib/components/category-stripe.svelte";
  import { categoryForKey } from "#lib/data/categories.js";
  import { page } from "$app/state";

  import type { CategoryKey } from "#lib/data/categories.js";
  import type { CategoryProgress } from "#lib/engine/progress.js";

  let { key, progress }: { key: CategoryKey; progress: CategoryProgress } = $props();

  const { color, description, href, name } = $derived(categoryForKey(key, page.data.locale));
</script>

<!-- The total counts what the filters still show, so filtering shrinks it. -->
<CategoryStripe
  {color}
  completed={progress.completed}
  {description}
  {href}
  icon={key}
  {name}
  total={progress.completed + progress.remainingInScope}
  trackedTotal={progress.total}
/>
