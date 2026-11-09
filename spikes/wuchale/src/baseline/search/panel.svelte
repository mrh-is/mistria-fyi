<script>
  import * as m from "#lib/paraglide/messages.js";

  let { count, gameName, locale, onCountChange, query, showError } = $props();
</script>

<main>
  <h1>{m.toolbar_search_label({}, { locale })}</h1>
  <input
    aria-label={m.toolbar_search_label({}, { locale })}
    placeholder={m.toolbar_search_placeholder({}, { locale })}
    value={query}
  />
  <p data-game-name>{gameName}</p>
  {#if showError}
    <p>{m.search_error({}, { locale })}</p>
  {:else if count === 0}
    <p>{m.search_no_results({}, { locale })}</p>
  {:else}
    <p>{m.search_results_count({ count }, { locale })}</p>
  {/if}
  <a href="?count=2">{m.search_guide_link({ query }, { locale })}</a>
  <button onclick={onCountChange}>{m.action_retry({}, { locale })}</button>
</main>
