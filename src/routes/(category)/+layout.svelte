<script lang="ts">
  import PageHeader from "#lib/components/page-header.svelte";
  import PageSearchStatus from "#lib/components/page-search-status.svelte";
  import SearchGuideLink from "#lib/components/search-guide-link.svelte";
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

  // The fraction ignores the filters. The bar's To do tint follows them, like the sections below.
  let progress = $derived(
    getCategoryProgress(key, userState.progressContext, { showsSource: toolbarState.showsSource }),
  );
</script>

<div class="min-w-0" style="--primary: {color}">
  <PageHeader title={name} {progress} category={key} />
  <div class="flex flex-col gap-4 px-4 pt-4 pb-4">
    <PageSearchStatus locale={data.locale} />
    {@render children()}
    <SearchGuideLink locale={data.locale} />
  </div>
</div>
