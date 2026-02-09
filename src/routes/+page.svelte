<script lang="ts">
  import { Settings } from "@lucide/svelte";

  import AvailabilityToggle from "$lib/components/availability-toggle.svelte";
  import CategoryGrid from "$lib/components/category-grid.svelte";
  import SearchBar from "$lib/components/search-bar.svelte";
  import SearchResults from "$lib/components/search-results.svelte";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";
  import WorldStateSelector from "$lib/components/world-state-selector.svelte";

  let searchQuery = $state("");
</script>

<div class="flex flex-col gap-4 p-4">
  <div class="flex items-center justify-between">
    <h1 class="text-lg font-semibold">Harvest Helper 🌾</h1>
    <div class="flex items-center gap-2">
      <ThemeToggle />
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- known route -->
      <a class="text-muted-foreground hover:text-foreground p-1" href="/settings">
        <Settings class="size-5" />
      </a>
    </div>
  </div>

  <SearchBar onSearch={(q: string) => (searchQuery = q)} />
  <WorldStateSelector />
  <AvailabilityToggle />

  {#if searchQuery}
    <SearchResults query={searchQuery} />
  {:else}
    <CategoryGrid />
  {/if}
</div>
