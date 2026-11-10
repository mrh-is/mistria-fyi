<script lang="ts">
  import IconArrowRight from "@tabler/icons-svelte-runes/icons/arrow-right";

  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import * as m from "#lib/ui-messages/messages.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import type { LocaleCode } from "#lib/types/locale.js";

  /** Sits after a page's rows: an extra tool for a search the page didn't answer. */
  let { locale }: { locale: LocaleCode } = $props();

  let query = $derived(toolbarState.searchQuery.trim());
</script>

{#if query}
  <p class="search-guide">
    {m.search_guide_prompt({}, { locale })}
    <a
      href={localizedHref("", { locale })}
      onclick={() => {
        toolbarState.carrySearchToNextPage();
      }}
    >
      {m.search_guide_link({ query }, { locale })}
      <IconArrowRight class="size-4 shrink-0" aria-hidden="true" />
    </a>
  </p>
{/if}

<style>
  .search-guide {
    display: grid;
    justify-items: start;
    margin: 0;
    padding-block: 12px 56px;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-xs);
  }

  .search-guide a {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    gap: 4px;
    color: var(--color-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
