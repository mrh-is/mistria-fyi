<script lang="ts">
  import AllCompleted from "#lib/components/all-completed.svelte";
  import { Icon } from "#lib/components/icon/index.js";
  import PageHeader from "#lib/components/page-header.svelte";
  import PageSearchStatus from "#lib/components/page-search-status.svelte";
  import ShelfFold from "#lib/components/shelf-fold.svelte";
  import { createSharedReveals } from "#lib/controllers/completion-scope.svelte.js";
  import { readEverythingGrouping } from "#lib/controllers/everything-grouping.js";
  import { useLedgerArrival } from "#lib/controllers/ledger-page.svelte.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { sortCategoryKeysByName } from "#lib/data/categories.js";
  import { trackerIndex } from "#lib/data/index.js";
  import { CATEGORY_KEYS, getAllProgress, getOverallProgress } from "#lib/engine/categories.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { building } from "$app/env";
  import { page } from "$app/state";

  import CategorySection from "./category-section.svelte";
  import SourceContent from "./source-content.svelte";

  import type { CategoryProgress } from "#lib/engine/progress.js";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  createSharedReveals();

  let orderedCategories = $derived(sortCategoryKeysByName(CATEGORY_KEYS, data.locale));

  registerSourceFilters("all", () => trackerIndex.categorySourceTypes.all);

  let headerEl = $state<HTMLElement | undefined>(undefined);
  let headerHeight = $state(0);

  $effect(() => {
    if (!headerEl) return;
    const el = headerEl;
    const ro = new ResizeObserver(() => {
      headerHeight = el.offsetHeight;
    });
    ro.observe(headerEl);
    return () => {
      ro.disconnect();
    };
  });

  let progress = $derived(
    getAllProgress(userState.progressContext, { showsSource: toolbarState.showsSource }),
  );

  let overallProgress = $derived(getOverallProgress(progress));
  let grouping = $derived(readEverythingGrouping());
  let anchor = $derived(building ? "" : page.url.hash.slice(1));
  let placeProgress = $state<CategoryProgress | undefined>(undefined);
  let headerProgress = $derived(grouping === "source" ? placeProgress : overallProgress);

  useLedgerArrival(() => (grouping === "category" ? anchor : ""));
</script>

<PageHeader bind:ref={headerEl} title="Everything" progress={headerProgress}>
  {#snippet icon(cls)}
    <Icon.Category category="all" useCategoryColor class={cls} />
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-6 px-4 pb-4" style="--section-header-sticky-top: {headerHeight}px">
  <PageSearchStatus />
  {#if grouping === "source"}
    <SourceContent locale={data.locale} {anchor} {progress} bind:placeProgress />
  {:else}
    {#each orderedCategories as category (category)}
      <CategorySection key={category} locale={data.locale} progress={progress[category]} />
    {/each}
    {#if overallProgress.completed > 0}
      <!-- Opens only on request, because it renders every category a second time. -->
      <div class="flex flex-col gap-6" data-testid="everything-completed">
        <ShelfFold explains forceOpen={!!toolbarState.searchQuery} level={2} shelf="completed">
          <div class="flex flex-col gap-6">
            {#each orderedCategories as category (category)}
              <CategorySection
                completed
                key={category}
                locale={data.locale}
                progress={progress[category]}
              />
            {/each}
          </div>
        </ShelfFold>
      </div>
    {/if}
  {/if}

  <AllCompleted isAllCompleted={overallProgress.completed >= overallProgress.total} />
</div>
