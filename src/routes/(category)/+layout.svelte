<script lang="ts">
  import PageHeader from "#lib/components/page-header.svelte";
  import PageSearchStatus from "#lib/components/page-search-status.svelte";
  import { visibleWindows } from "#lib/controllers/page-search.svelte.js";
  import { categoryForKey, categoryKeyForPathname } from "#lib/data/categories.js";
  import { getCategoryProgress } from "#lib/engine/categories.js";
  import { deLocalizeHref } from "#lib/paraglide/runtime.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { page } from "$app/state";

  import type { LayoutProps } from "./$types";

  let { children, data }: LayoutProps = $props();

  let key = $derived.by(() => {
    const pathname = deLocalizeHref(page.url.pathname);
    const categoryKey = categoryKeyForPathname(pathname);
    if (!categoryKey) throw new Error(`Unknown category route: ${pathname}`);
    return categoryKey;
  });
  const { color, name } = $derived(categoryForKey(key, data.locale));

  // The header agrees with the sections below it, so it follows this page's filters, paused or not.
  let progress = $derived(
    getCategoryProgress(
      key,
      { ...userState.progressContext, availabilityWindows: visibleWindows() },
      {
        matchesSources: (sources) => toolbarState.matchesSourceFilters(sources),
      },
    ),
  );
</script>

<div class="min-w-0" style="--primary: {color}">
  <PageHeader title={name} {progress} category={key} />
  <div class="flex flex-col gap-4 px-4 pt-4 pb-4">
    <PageSearchStatus locale={data.locale} />
    {@render children()}
  </div>
</div>
