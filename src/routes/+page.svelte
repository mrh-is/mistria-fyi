<script lang="ts">
  import { ChevronRight, Layers, Settings, Wheat } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import CategoryGrid from "$lib/components/category-grid.svelte";
  import OverallProgress from "$lib/components/overall-progress.svelte";
  import SearchResults from "$lib/components/search-results.svelte";
  import WelcomeCard from "$lib/components/welcome-card.svelte";
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
    <a
      class="flex items-center gap-3 rounded-xl border border-border/50 bg-accent/20 px-4 py-3 transition-colors hover:bg-accent/40"
      href={resolve("/all")}
    >
      <Layers class="size-4 shrink-0 text-muted-foreground" />
      <span class="flex-1 text-sm font-medium text-muted-foreground">Everything</span>
      <span class="text-sm text-muted-foreground">{totalCompleted}/{grandTotal}</span>
      <ChevronRight class="size-4 shrink-0 text-muted-foreground/50" />
    </a>
  {/if}
</div>
