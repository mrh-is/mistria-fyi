<script lang="ts">
  import { Settings, Wheat } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import CategoryGrid from "$lib/components/category-grid.svelte";
  import OverallProgress from "$lib/components/overall-progress.svelte";
  import SearchResults from "$lib/components/search-results.svelte";
  import WelcomeCard from "$lib/components/welcome-card.svelte";
  import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
</script>

<div class="flex flex-col gap-3 p-4 pt-safe-or-4">
  <div class="flex items-center justify-between">
    <h1 class="flex items-center gap-1.5 text-xl font-semibold">
      <Wheat class="size-5 text-amber-600 dark:text-amber-400" />
      Harvest Helper
    </h1>
    <div class="flex items-center gap-2">
      <OverallProgress />
      <a
        class="-mr-3 flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"
        href={resolve("/settings")}
        aria-label="Settings"
      >
        <Settings class="size-5" />
      </a>
    </div>
  </div>

  {#if toolbarState.searchQuery}
    <SearchResults query={toolbarState.searchQuery} />
  {:else}
    <WelcomeCard />
    <CategoryGrid />
  {/if}
</div>
