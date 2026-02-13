<script lang="ts">
  import { page } from "$app/state";
  import { categoryColor, type CategoryKey } from "$lib/data/categories.js";

  let { children } = $props();

  let key = $derived(page.url.pathname.slice(1) as CategoryKey);
</script>

<div class="flex flex-col gap-4 px-4 pb-4" style="--primary: var(--{categoryColor(key)})">
  {@render children()}
</div>
