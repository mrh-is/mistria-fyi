<script lang="ts">
  import IconNotebook from "@tabler/icons-svelte-runes/icons/notebook";

  import CategoryGrid from "#lib/components/category-grid.svelte";
  import { Icon } from "#lib/components/icon/index.js";
  import OverallProgress from "#lib/components/overall-progress.svelte";
  import SearchResults from "#lib/components/search-results.svelte";
  import WelcomeCard from "#lib/components/welcome-card.svelte";
  import { getAllProgress, getOverallProgress } from "#lib/engine/progress.js";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  let allProgress = $derived(
    getAllProgress({
      availabilityWindows: userState.state.availabilityWindows,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    }),
  );

  let overall = $derived(getOverallProgress(allProgress));
  let overallPct = $derived(overall.total > 0 ? (overall.completed / overall.total) * 100 : 0);
  let totalCompleted = $derived(formatNumber(overall.completed, data.locale));
  let grandTotal = $derived(formatNumber(overall.total, data.locale));
</script>

<div class="home-page">
  <header class="home-header" style="--overall-progress: {overallPct}%">
    <h1 class="flex min-w-0 items-center gap-2 font-brand text-2xl leading-none">
      <IconNotebook class="size-5 shrink-0 text-(--color-brand-mark)" />
      {m.app_name()}
    </h1>
    <OverallProgress progress={allProgress} />
    <span class="overall-progress-rule" aria-hidden="true"><i></i></span>
  </header>

  <div class="flex flex-col gap-3 px-4 pb-4">
    {#if toolbarState.searchQuery}
      <SearchResults locale={data.locale} query={toolbarState.searchQuery} />
    {:else}
      <WelcomeCard />
      <h2 class="px-1 font-controls text-2xs tracking-[0.14em] text-muted-foreground uppercase">
        {m.home_index_heading()}
      </h2>
      <CategoryGrid progress={allProgress} />
      <a
        class="everything-link"
        href={localizedHref("all")}
        aria-label={m.section_progress_label({
          completed: totalCompleted,
          name: m.home_everything_label(),
          total: grandTotal,
        })}
      >
        <Icon.Category category="all" class="size-4 shrink-0" />
        <span class="flex-1">{m.home_everything_label()}</span>
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
    z-index: var(--z-home-header);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: max(16px, env(safe-area-inset-top)) 22px 13px;
    background: color-mix(in srgb, var(--color-paper) 96%, transparent);
    backdrop-filter: blur(10px);
  }

  .overall-progress-rule {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 3px;
    background: var(--color-paper-sunken);
  }

  .overall-progress-rule i {
    display: block;
    width: var(--overall-progress);
    height: 100%;
    background: var(--color-home-accent);
    transition: width 300ms ease-out;
  }

  .everything-link {
    display: flex;
    min-height: 44px;
    align-items: center;
    gap: 12px;
    padding: 4px 8px;
    color: var(--color-ink-muted);
    font-size: var(--text-sm);
  }

  .everything-link:is(:hover, :focus-visible) {
    color: var(--color-ink);
    outline: 2px solid var(--color-home-accent);
    outline-offset: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .overall-progress-rule i {
      transition-duration: 0.01ms;
    }
  }
</style>
