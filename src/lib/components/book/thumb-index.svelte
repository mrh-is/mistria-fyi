<!--
  The thumb tabs as a labeled list, for the toolbar's Contents panel below book widths. Each row ends
  in its tab, so the phone's index reads as the same book. Send a note & Settings follow, as they
  follow the tabs on the rail.
-->
<script lang="ts">
  import IconMessageReport from "@tabler/icons-svelte-runes/icons/message-report";
  import IconSettings from "@tabler/icons-svelte-runes/icons/settings";

  import { getBookPanels } from "#lib/components/book/book-panels.svelte.js";
  import ThumbTabIcon from "#lib/components/book/thumb-tab-icon.svelte";
  import { thumbTabKeyForPathname, thumbTabs } from "#lib/components/book/thumb-tab-messages.js";
  import { stripLocale } from "#lib/i18n/locale-path.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  const panels = getBookPanels();

  let tabs = $derived(thumbTabs(page.data.locale));
  let current = $derived(thumbTabKeyForPathname(stripLocale(page.url.pathname)));
</script>

<ul class="thumb-index">
  {#each tabs as tab (tab.key)}
    <li>
      <a
        class="thumb-index__row"
        href={localizedHref(tab.path)}
        aria-current={tab.key === current ? "page" : undefined}
        style:--thumb-tab-color={tab.color}
        style:--thumb-tab-ink={tab.ink}
      >
        <span class="thumb-index__name">{tab.name}</span>
        <span class="thumb-index__tab"><ThumbTabIcon key={tab.key} class="size-4" /></span>
      </a>
    </li>
  {/each}
</ul>
<ul class="thumb-index thumb-index--tools">
  <li>
    <button
      class="thumb-index__row thumb-index__row--tool"
      type="button"
      onclick={(event) => {
        panels.open("feedback", event.currentTarget);
      }}
    >
      <IconMessageReport class="size-4" />
      <span class="thumb-index__name">Send feedback</span>
    </button>
  </li>
  <li>
    <button
      class="thumb-index__row thumb-index__row--tool"
      type="button"
      aria-controls="quick-settings-panel"
      onclick={(event) => {
        panels.open("settings", event.currentTarget);
      }}
    >
      <IconSettings class="size-4" />
      <span class="thumb-index__name">Quick settings</span>
    </button>
  </li>
</ul>

<style>
  .thumb-index {
    margin: 0;
    padding: 0 0 0 0.75rem;
    list-style: none;
  }

  .thumb-index__row {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.75rem;
    border-bottom: 1px solid color-mix(in srgb, var(--color-ink-hairline) 30%, transparent);
    color: var(--color-ink);
    font-family: var(--font-body);
    font-size: var(--text-base);
    text-decoration: none;
  }

  /*
   * Send a note & Settings stay pinned to the panel's foot, side by side, so a reader doesn't have
   * to scroll past every tab to find them.
   */
  .thumb-index--tools {
    position: sticky;
    bottom: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-top: 0.75rem;
    border-top: 1px solid var(--color-rule);
    background: var(--color-paper-raised);
  }

  .thumb-index__row--tool {
    width: 100%;
    border-bottom: 0;
    background: none;
    color: var(--color-ink-muted);
    font-size: var(--text-sm);
    text-align: start;
  }

  .thumb-index__name {
    min-width: 0;
    flex: 1;
  }

  .thumb-index__row[aria-current="page"] .thumb-index__name {
    font-weight: 600;
  }

  .thumb-index__tab {
    display: grid;
    width: 2.25rem;
    height: 2.125rem;
    flex: none;
    place-items: center;
    border-radius: var(--radius-xl) 0 0 var(--radius-xl);
    background: var(--thumb-tab-color);
    color: var(--thumb-tab-ink);
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 40%, transparent);
    border-right: 0;
    box-shadow: var(--shadow-thumb-tab);
  }

  .thumb-index__row[aria-current="page"] .thumb-index__tab {
    width: 3rem;
  }

  .thumb-index__row:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: -2px;
  }
</style>
