<script lang="ts">
  import AllCompleted from "#lib/components/all-completed.svelte";
  import { Icon } from "#lib/components/icon/index.js";
  import PageHeader from "#lib/components/page-header.svelte";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { CATEGORY_KEYS, sortCategoryKeysByName } from "#lib/data/categories.js";
  import { trackerIndex } from "#lib/data/index.js";
  import { getAllProgress, getOverallProgress } from "#lib/engine/progress.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import CategorySection from "./category-section.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  let orderedCategories = $derived(sortCategoryKeysByName(CATEGORY_KEYS, data.locale));

  registerSourceFilters("all", () => trackerIndex.categorySourceTypes.all);

  let headerEl = $state<HTMLElement | undefined>(undefined);
  let headerH = $state(0);

  $effect(() => {
    if (!headerEl) return;
    const el = headerEl;
    const ro = new ResizeObserver(() => {
      headerH = el.offsetHeight;
    });
    ro.observe(headerEl);
    return () => {
      ro.disconnect();
    };
  });

  let progress = $derived(
    getAllProgress({
      availabilityWindows: userState.state.availabilityWindows,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let overallProgress = $derived(getOverallProgress(progress));
</script>

<PageHeader bind:ref={headerEl} title={m.home_everything_label()} progress={overallProgress}>
  {#snippet icon(cls)}
    <Icon.Category category="all" useCategoryColor class={cls} />
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-6 px-4 pb-4" style="--section-top: {headerH}px">
  {#each orderedCategories as category (category)}
    <CategorySection key={category} locale={data.locale} progress={progress[category]} />
  {/each}

  <AllCompleted isAllCompleted={overallProgress.completed >= overallProgress.total} />
</div>
