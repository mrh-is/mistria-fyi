<script lang="ts">
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
    <ThemeToggle />
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
