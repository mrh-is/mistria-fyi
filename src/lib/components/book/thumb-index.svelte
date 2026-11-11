<!--
  The thumb tabs as a labeled list, for the toolbar's Contents panel below book widths. Each row ends
  in its tab, so the phone's index reads as the same book. Send a note & Settings follow, as they
  follow the tabs on the rail.
-->
<script lang="ts">
  import IconMessageReport from "@tabler/icons-svelte-runes/icons/message-report";
  import IconSettings from "@tabler/icons-svelte-runes/icons/settings";

  import ThumbTabIcon from "#lib/components/book/thumb-tab-icon.svelte";
  import { thumbTabKeyForPathname, thumbTabs } from "#lib/components/book/thumb-tab-list.js";
  import * as m from "#lib/paraglide/messages.js";
  import { deLocalizeHref } from "#lib/paraglide/runtime.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  let tabs = $derived(thumbTabs(page.data.locale));
  let current = $derived(thumbTabKeyForPathname(deLocalizeHref(page.url.pathname)));
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
      onclick={() => {
        toolbarState.requestPanel("feedback");
      }}
    >
      <IconMessageReport class="size-4" />
      <span class="thumb-index__name">{m.toolbar_send_feedback()}</span>
    </button>
  </li>
  <li>
    <button
      class="thumb-index__row thumb-index__row--tool"
      type="button"
      aria-controls="quick-settings-panel"
      onclick={() => {
        toolbarState.requestPanel("settings");
      }}
    >
      <IconSettings class="size-4" />
      <span class="thumb-index__name">{m.toolbar_quick_settings()}</span>
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

  .thumb-index--tools {
    margin-top: 0.75rem;
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
