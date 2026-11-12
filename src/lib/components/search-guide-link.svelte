<script lang="ts">
  import IconArrowRight from "@tabler/icons-svelte-runes/icons/arrow-right";

  import { searchGuideLinkLabel } from "#lib/components/search-guide-messages.js";
  import { inLocale } from "#lib/i18n/locale-runtime.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import type { LocaleCode } from "#lib/types/locale.js";

  /** Sits after a page's rows: an extra tool for a search the page didn't answer. */
  let { locale }: { locale: LocaleCode } = $props();

  let query = $derived(toolbarState.searchQuery.trim());
</script>

{#if query}
  <p class="search-guide">
    Still looking for something?
    <a
      href={localizedHref("", { locale })}
      onclick={() => {
        toolbarState.carrySearchToNextPage();
      }}
    >
      {inLocale(locale, () => searchGuideLinkLabel(query))}
      <IconArrowRight class="size-4 shrink-0" aria-hidden="true" />
    </a>
    <button type="button" onclick={() => toolbarState.setSearchQuery("")}>
      {`Clear “${query}”`}
    </button>
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

  .search-guide a,
  .search-guide button {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    gap: 4px;
    color: var(--color-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
