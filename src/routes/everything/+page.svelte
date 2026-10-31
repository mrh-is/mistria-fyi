<script lang="ts">
  import { tick } from "svelte";
  import { SvelteURL } from "svelte/reactivity";

  import AllCompleted from "#lib/components/all-completed.svelte";
  import CompletedHeading from "#lib/components/completed-heading.svelte";
  import { Icon } from "#lib/components/icon/index.js";
  import PageHeader from "#lib/components/page-header.svelte";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { sortCategoryKeysByName } from "#lib/data/categories.js";
  import { trackerIndex } from "#lib/data/index.js";
  import { CATEGORY_KEYS, getAllProgress, getOverallProgress } from "#lib/engine/categories.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { building } from "$app/env";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  import CategorySection from "./category-section.svelte";
  import SourceContent from "./source-content.svelte";

  import type { CategoryKey } from "#lib/engine/categories.js";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  let orderedCategories = $derived(sortCategoryKeysByName(CATEGORY_KEYS, data.locale));
  const completedContent = $state<Partial<Record<CategoryKey, boolean>>>({});

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

  let progress = $derived(getAllProgress(userState.progressContext));

  let overallProgress = $derived(getOverallProgress(progress));
  let grouping = $derived.by(() => {
    const requested = building ? null : page.url.searchParams.get("group");
    if (requested === "source" || requested === "category") return requested;
    return userState.state.everythingGrouping;
  });
  let anchor = $derived(building ? "" : page.url.hash.slice(1));

  function changeGrouping(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const next = value === "source" ? "source" : "category";
    userState.setEverythingGrouping(next);
    const url = new SvelteURL(page.url.href);
    url.searchParams.set("group", next);
    url.hash = "";
    void goto(url, { reset: false });
  }

  $effect(() => {
    const target = anchor;
    void grouping;
    if (!target) return;
    let cancelled = false;
    async function scrollToAnchor(): Promise<void> {
      await tick();
      // A previous hash target can still be closing. Its slide changes the next target’s offset.
      const animations = document.getAnimations().filter((animation) => {
        const element = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        return element instanceof Element && element.closest("[data-source-section]");
      });
      await Promise.allSettled(animations.map((animation) => animation.finished));
      await tick();
      if (!cancelled) document.getElementById(target)?.scrollIntoView({ block: "start" });
    }
    void scrollToAnchor();
    return () => {
      cancelled = true;
    };
  });
</script>

<PageHeader bind:ref={headerEl} title={m.home_everything_label()} progress={overallProgress}>
  {#snippet icon(cls)}
    <Icon.Category category="all" useCategoryColor class={cls} />
  {/snippet}
</PageHeader>

<div class="flex flex-col gap-6 px-4 pb-4" style="--section-header-sticky-top: {headerHeight}px">
  <label class="flex items-center gap-3 self-start font-controls text-sm">
    <span>{m.everything_group_by()}</span>
    <select
      class="min-h-11 rounded border border-border bg-background px-3 py-1 text-foreground"
      aria-label={m.everything_group_by()}
      value={grouping}
      onchange={changeGrouping}
    >
      <option value="category">{m.everything_group_category()}</option>
      <option value="source">{m.everything_group_source()}</option>
    </select>
  </label>
  {#if grouping === "source"}
    <SourceContent locale={data.locale} {anchor} />
  {:else}
    {#each orderedCategories as category (category)}
      <CategorySection key={category} locale={data.locale} progress={progress[category]} />
    {/each}
    {#if userState.state.showCompleted}
      <!-- Stays mounted while hidden, since its categories report whether they have content. -->
      <div
        class="flex flex-col gap-6"
        data-testid="everything-completed"
        hidden={!Object.values(completedContent).some(Boolean)}
      >
        <CompletedHeading class="px-2 pt-2" />
        {#each orderedCategories as category (category)}
          <CategorySection
            bind:hasContent={completedContent[category]}
            completed
            key={category}
            locale={data.locale}
            progress={progress[category]}
          />
        {/each}
      </div>
    {/if}
  {/if}

  <AllCompleted isAllCompleted={overallProgress.completed >= overallProgress.total} />
</div>
