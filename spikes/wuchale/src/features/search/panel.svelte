<script>
  import plural from "../../../catalogs/plural.js";

  let { count, gameName, onCountChange, query, showError } = $props();
</script>

<main>
  <h1>Search items</h1>
  <input aria-label="Search items" placeholder="Search items…" value={query} />
  <p data-game-name>{gameName}</p>
  {#if showError}
    <p>We couldn’t load search. Check that you’re online, then try again.</p>
  {:else if count === 0}
    <p>No items found</p>
  {:else}
    <p>{plural(count, ["# result", "# results"])}</p>
  {/if}
  <a href="?count=2">{`Search the entire Field Guide for “${query}”`}</a>
  <button onclick={onCountChange}>Try again</button>
</main>
