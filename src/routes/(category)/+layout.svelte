<script lang="ts">
  import { page } from "$app/state";
  import PageHeader from "$lib/components/page-header.svelte";
  import { categoryForKey, categoryKeyForPathname } from "$lib/data/categories.js";
  import { getCategoryProgress } from "$lib/engine/progress.js";
  import { deLocalizeHref } from "$lib/paraglide/runtime.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { LayoutProps } from "./$types";

  let { children, data }: LayoutProps = $props();

  let key = $derived.by(() => {
    const pathname = deLocalizeHref(page.url.pathname);
    const categoryKey = categoryKeyForPathname(pathname);
    if (!categoryKey) throw new Error(`Unknown category route: ${pathname}`);
    return categoryKey;
  });
  const { color, name } = $derived(categoryForKey(key, data.locale));

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
