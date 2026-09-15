<script lang="ts">
  import { page } from "$app/state";
  import PageHeader from "$lib/components/page-header.svelte";
  import { categoryForKey, type CategoryKey } from "$lib/data/categories.js";
  import { getCategoryProgress } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let { children } = $props();

  let key = $derived(page.url.pathname.slice(1) as CategoryKey);
  const { color, name } = $derived(categoryForKey(key));

  let progress = $derived(
    getCategoryProgress(key, {
      availabilityWindows: userState.state.availabilityWindows,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );
</script>

<div class="min-w-0" style="--primary: var(--{color})">
  <PageHeader title={name} {progress} category={key} />
  <div class="flex flex-col gap-4 px-4 pt-4 pb-4">
    {@render children()}
  </div>
</div>
