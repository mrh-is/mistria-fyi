<script lang="ts">
  import IconInfoCircle from "@tabler/icons-svelte-runes/icons/info-circle";

  import { Icon } from "#lib/components/icon/index.js";
  import ShelfExplainer from "#lib/components/shelf-explainer.svelte";
  import * as m from "#lib/paraglide/messages.js";
  import { shelfLabel } from "#lib/presentation/shelves.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { Shelf } from "#lib/engine/shelves.js";

  /**
   * A shelf's name. Given `onToggle` it's the disclosure of a fold; without it, a plain heading, as
   * on the home page & above the To do shelf.
   */
  let {
    class: className = "",
    count,
    expanded = false,
    explains = true,
    level = 2,
    onToggle,
    shelf,
  }: {
    class?: string;
    /** How much the fold holds, for a reader deciding whether to open it. */
    count?: number;
    expanded?: boolean;
    /** Offers the explainer. Folds inside a section leave it to the page's own headings. */
    explains?: boolean;
    level?: 2 | 3 | 4;
    onToggle?: () => void;
    shelf: Shelf;
  } = $props();

  let explainerOpen = $state(false);
  let label = $derived(shelfLabel(shelf));
</script>

{#snippet name()}
  {#if shelf === "completed"}<Icon.Category category="complete" class="size-3.5" />{/if}
  <span>{label}</span>
{/snippet}

<div class={["shelf-heading", `shelf-heading--${shelf}`, className]} data-shelf-heading={shelf}>
  <svelte:element this={`h${level}`} class="shelf-heading__title">
    {#if onToggle}
      <button
        class="shelf-heading__toggle"
        type="button"
        aria-expanded={expanded}
        onclick={onToggle}
      >
        <Icon.UI
          type="disclosure"
          class="size-3.5 shrink-0 transition-transform motion-reduce:transition-none {expanded
            ? 'rotate-90'
            : ''}"
        />
        {@render name()}
      </button>
    {:else}
      {@render name()}
    {/if}
  </svelte:element>
  {#if explains}
    <button
      class="shelf-heading__info"
      type="button"
      aria-label={m.shelf_explainer_open({ shelf: label })}
      onclick={() => (explainerOpen = true)}><IconInfoCircle class="size-3.5" /></button
    >
  {/if}
  {#if count !== undefined}
    <span class="shelf-heading__count">{formatNumber(count, page.data.locale)}</span>
  {/if}
</div>

{#if explains}<ShelfExplainer bind:open={explainerOpen} />{/if}

<style>
  .shelf-heading {
    display: flex;
    min-height: 28px;
    align-items: center;
    gap: 2px;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-2xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .shelf-heading--todo {
    color: var(--color-ink);
  }

  .shelf-heading--completed {
    color: var(--color-progress-complete);
  }

  .shelf-heading__title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
    margin: 0;
    font: inherit;
  }

  .shelf-heading__toggle {
    display: flex;
    min-height: 44px;
    align-items: center;
    gap: 6px;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
  }

  .shelf-heading__info {
    display: grid;
    width: 36px;
    height: 36px;
    margin-block: -4px;
    place-items: center;
    color: var(--color-ink-muted);
  }

  .shelf-heading__toggle:focus-visible,
  .shelf-heading__info:is(:hover, :focus-visible) {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .shelf-heading__info:is(:hover, :focus-visible) {
    outline-color: var(--shelf-heading-info-accent, var(--primary));
  }

  .shelf-heading__count {
    margin-inline-start: auto;
    font-family: var(--font-data);
    font-size: var(--text-xs);
    letter-spacing: 0;
  }
</style>
