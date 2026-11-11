<script lang="ts">
  import IconMessageReport from "@tabler/icons-svelte-runes/icons/message-report";
  import IconSettings from "@tabler/icons-svelte-runes/icons/settings";
  import IconTags from "@tabler/icons-svelte-runes/icons/tags";

  import ThumbTabIcon from "#lib/components/book/thumb-tab-icon.svelte";
  import { thumbTabKeyForPathname, thumbTabs } from "#lib/components/book/thumb-tab-list.js";
  import * as m from "#lib/paraglide/messages.js";
  import { deLocalizeHref } from "#lib/paraglide/runtime.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";

  // Pages without the toolbar (legal & dev pages) have no panels for Settings & Send a note to open.
  let { hasToolbar }: { hasToolbar: boolean } = $props();

  let tabs = $derived(thumbTabs(page.data.locale));
  let current = $derived(thumbTabKeyForPathname(deLocalizeHref(page.url.pathname)));

  // The tabs carry no names until you hover or focus one, or turn names on for all of them, which
  // is how a touch screen reads them. Names go off again once you pick a page.
  let labeled = $state(false);
  afterNavigate(({ type }) => {
    if (type !== "enter") labeled = false;
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape" && labeled) labeled = false;
  }}
/>

<div class="rail">
  <nav class="thumb-tabs" class:thumb-tabs--labeled={labeled} aria-label={m.book_tabs_label()}>
    <button
      class="rail__tool thumb-tabs__names"
      type="button"
      aria-label={m.book_tabs_show_names()}
      aria-pressed={labeled}
      onclick={() => {
        labeled = !labeled;
      }}
    >
      <IconTags class="size-4" />
    </button>
    <ul class="thumb-tabs__list">
      {#each tabs as tab (tab.key)}
        <li class="thumb-tabs__item">
          <a
            class="thumb-tab"
            class:thumb-tab--home={tab.key === "home"}
            class:thumb-tab--everything={tab.key === "everything"}
            href={localizedHref(tab.path)}
            aria-current={tab.key === current ? "page" : undefined}
            style:--thumb-tab-color={tab.color}
            style:--thumb-tab-ink={tab.ink}
          >
            <span class="thumb-tab__face">
              <ThumbTabIcon key={tab.key} class="size-4" />
            </span>
            <span class="thumb-tab__name">{tab.name}</span>
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  {#if hasToolbar}
    <div class="rail__meta">
      <button
        class="rail__tool"
        type="button"
        aria-label={m.toolbar_send_feedback()}
        aria-expanded={toolbarState.activePanel === "feedback"}
        onclick={() => {
          toolbarState.requestPanel("feedback");
        }}
      >
        <IconMessageReport class="size-4" />
      </button>
      <button
        class="rail__tool"
        type="button"
        aria-label={m.toolbar_quick_settings()}
        aria-expanded={toolbarState.activePanel === "settings"}
        aria-controls="quick-settings-panel"
        onclick={() => {
          toolbarState.requestPanel("settings");
        }}
      >
        <IconSettings class="size-4" />
      </button>
    </div>
  {/if}
</div>

<style>
  .rail {
    position: sticky;
    top: 0;
    display: flex;
    height: 100dvh;
    flex-direction: column;
    padding-block: clamp(0.5rem, 3dvh, var(--size-book-margin));
    view-transition-name: book-rail;
  }

  .thumb-tabs {
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.5rem;
  }

  .thumb-tabs__list {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Tabs shrink to fit a short window, down to a target you can still hit. */
  .thumb-tabs__item {
    display: flex;
    min-height: 1.75rem;
    flex: 0 1 2.625rem;
  }

  /* Home sits apart from the categories, and Everything apart at the foot, as in round ten. */
  .thumb-tabs__item:first-child {
    margin-bottom: 0.375rem;
  }

  .thumb-tabs__item:last-child {
    margin-top: 0.375rem;
  }

  .thumb-tab {
    position: relative;
    display: flex;
    flex: 1;
    align-items: stretch;
    color: var(--thumb-tab-ink);
    text-decoration: none;
    outline: none;
  }

  .thumb-tab__face {
    display: grid;
    width: 1.875rem;
    place-items: center;
    border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
    background: var(--thumb-tab-color);
    box-shadow: var(--shadow-thumb-tab);
    transition: width 420ms cubic-bezier(0.45, 0.05, 0.25, 1);
  }

  /* The current tab is wider, and its color runs a little way onto the page. */
  .thumb-tab[aria-current="page"] .thumb-tab__face {
    width: 3.0625rem;
    margin-left: -0.4375rem;
    padding-left: 0.4375rem;
    border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
  }

  .thumb-tab:focus-visible .thumb-tab__face {
    outline: 2px solid var(--color-cover-ink);
    outline-offset: 2px;
  }

  /* Names sit to the tab's left, over the page's edge, so they never run off the window. */
  .thumb-tab__name {
    position: absolute;
    top: 50%;
    right: calc(100% + 0.5rem);
    padding: 0.1875rem 0.5rem;
    border-radius: var(--radius);
    background: var(--color-cover-deep);
    color: var(--color-cover-ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-variant-caps: all-small-caps;
    letter-spacing: 0.08em;
    line-height: 1.3;
    white-space: nowrap;
    box-shadow: var(--shadow-medium);
    opacity: 0;
    pointer-events: none;
    transform: translate(0.25rem, -50%);
    transition:
      opacity 160ms ease-out,
      transform 160ms ease-out;
  }

  .thumb-tab[aria-current="page"] .thumb-tab__name {
    right: calc(100% + 0.9375rem);
  }

  .thumb-tab:focus-visible .thumb-tab__name,
  .thumb-tabs--labeled .thumb-tab__name {
    opacity: 1;
    transform: translate(0, -50%);
  }

  /* Labeled names share the tab's color down their edge, so a name reads as its tab's. */
  .thumb-tabs--labeled .thumb-tab__name {
    border-right: 3px solid var(--thumb-tab-color);
    pointer-events: auto;
  }

  @media (hover: hover) and (pointer: fine) {
    .thumb-tab:hover .thumb-tab__face {
      width: 2.25rem;
    }

    .thumb-tab[aria-current="page"]:hover .thumb-tab__face {
      width: 3.0625rem;
    }

    .thumb-tab:hover .thumb-tab__name {
      opacity: 1;
      transform: translate(0, -50%);
    }
  }

  .rail__meta {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 0.375rem;
    padding-top: 0.5rem;
  }

  /* Quiet tools: an outline on the cloth, brighter when you point at them. */
  .rail__tool {
    display: grid;
    width: 2rem;
    height: 2rem;
    flex: none;
    margin-left: 0.25rem;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--color-cover-ink) 22%, transparent);
    background: none;
    color: var(--color-cover-ink-muted);
    transition:
      color 150ms ease-out,
      border-color 150ms ease-out;
  }

  .rail__tool:is(:hover, :focus-visible, [aria-expanded="true"], [aria-pressed="true"]) {
    border-color: color-mix(in srgb, var(--color-cover-ink) 60%, transparent);
    color: var(--color-cover-ink);
  }

  .rail__tool:focus-visible {
    outline: 2px solid var(--color-cover-ink);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .thumb-tab__face,
    .thumb-tab__name,
    .rail__tool {
      transition: none;
    }
  }
</style>
