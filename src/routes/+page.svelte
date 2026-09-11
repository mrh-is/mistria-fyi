<script lang="ts">
  import { Library } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import CategoryGrid from "$lib/components/category-grid.svelte";
  import { Icon } from "$lib/components/icon/index.js";
  import OverallProgress from "$lib/components/overall-progress.svelte";
  import SearchResults from "$lib/components/search-results.svelte";
  import { getAllProgress } from "$lib/engine/progress.js";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let allProgress = $derived(
    getAllProgress({
      availabilityMode: userState.state.availabilityMode,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let totalCompleted = $derived(
    Object.values(allProgress).reduce((sum, p) => sum + p.completed, 0),
  );
  let grandTotal = $derived(Object.values(allProgress).reduce((sum, p) => sum + p.total, 0));
  let overallPct = $derived(grandTotal > 0 ? (totalCompleted / grandTotal) * 100 : 0);
</script>

<div class="home-page">
  <header class="home-header" style="--overall-progress: {overallPct}%">
    <h1 class="flex min-w-0 items-center gap-2 font-display text-2xl leading-none">
      <Library class="size-5 shrink-0 text-amber-700 dark:text-amber-400" />
      Mistria Field Guide
    </h1>
    <OverallProgress />
    <span class="overall-progress-rule" aria-hidden="true"><i></i></span>
  </header>

  <div class="flex flex-col gap-3 px-4 pb-4">
    {#if toolbarState.searchQuery}
      <SearchResults query={toolbarState.searchQuery} />
    {:else}
      <h2 class="px-1 font-controls text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        Index
      </h2>
      <CategoryGrid />
      <a
        class="everything-link"
        href={resolve("/all")}
        aria-label="Everything, {totalCompleted} of {grandTotal} completed"
      >
        <Icon.Category category="all" class="size-4 shrink-0" />
        <span class="flex-1">Everything</span>
        <span class="font-data text-xs" aria-hidden="true">{totalCompleted} / {grandTotal}</span>
      </a>
    {/if}
  </div>
</div>

<style>
  .home-page {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 15px;
  }

  .home-header {
    position: sticky;
    top: 0;
    z-index: 12;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: max(16px, env(safe-area-inset-top)) 22px 13px;
    background: color-mix(in srgb, var(--paper) 96%, transparent);
    backdrop-filter: blur(10px);
  }

  .overall-progress-rule {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 3px;
    background: var(--paper-deep);
  }

  .overall-progress-rule i {
    display: block;
    width: var(--overall-progress);
    height: 100%;
    background: var(--fg-green);
    transition: width 300ms ease-out;
  }

  .everything-link {
    display: flex;
    min-height: 44px;
    align-items: center;
    gap: 12px;
    padding: 4px 8px;
    color: var(--ink-muted);
    font-size: 13px;
  }

  .everything-link:is(:hover, :focus-visible) {
    color: var(--ink);
    outline: 2px solid var(--fg-green);
    outline-offset: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .overall-progress-rule i {
      transition-duration: 0.01ms;
    }
  }
</style>
