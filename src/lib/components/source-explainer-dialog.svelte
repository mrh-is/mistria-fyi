<script lang="ts">
  import TagDialog from "$lib/components/tag-dialog.svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as m from "$lib/paraglide/messages.js";

  import type { SourceFilter } from "$lib/stores/toolbar-state.svelte.js";

  let { filters, open = $bindable(false) }: { filters: SourceFilter[]; open?: boolean } = $props();
</script>

<TagDialog bind:open>
  <div class="inventory-tag__body">
    <div class="inventory-tag__heading">
      <span class="inventory-tag__overline">{m.source_explainer_overline()}</span>
      <Dialog.Title>{m.visibility_source_types()}</Dialog.Title>
      <Dialog.Description class="sr-only">{m.source_explainer_description()}</Dialog.Description>
    </div>
    <ul class="inventory-tag__list">
      {#each filters as filter (filter.label)}
        {@const SourceIcon = filter.icon}
        <li>
          <SourceIcon class="size-4" />
          <div><strong>{filter.label}</strong><span>{filter.members.join(", ")}</span></div>
        </li>
      {/each}
    </ul>
  </div>
  <div class="inventory-tag__footer">
    <Dialog.Close class="inventory-tag__close">{m.source_explainer_dismiss()}</Dialog.Close>
  </div>
</TagDialog>

<style>
  .inventory-tag__body {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    padding: 15px 16px 0;
  }

  .inventory-tag__heading {
    padding-bottom: 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--tag-ink) 42%, transparent);
  }

  .inventory-tag__overline {
    display: block;
    font-family: var(--font-controls);
    font-size: 8px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .inventory-tag__heading :global(h2) {
    margin-top: 2px;
  }

  .inventory-tag__list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .inventory-tag__list li {
    display: flex;
    min-width: 0;
    gap: 7px;
    padding: 7px 6px;
    border-right: 1px solid color-mix(in srgb, var(--tag-ink) 22%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--tag-ink) 22%, transparent);
  }

  .inventory-tag__list li:nth-child(even) {
    border-right: 0;
  }

  .inventory-tag__list li:last-child {
    border-bottom: 0;
  }

  .inventory-tag__list :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  .inventory-tag__list strong,
  .inventory-tag__list span {
    display: block;
  }

  .inventory-tag__list strong {
    font-family: var(--font-controls);
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .inventory-tag__list span {
    margin-top: 1px;
    color: var(--tag-muted);
    font-family: var(--font-annotation);
    font-size: 9px;
    line-height: 1.25;
  }

  .inventory-tag__footer {
    display: flex;
    min-height: 44px;
    align-items: center;
    flex: 0 0 auto;
    justify-content: flex-end;
    padding: 8px 16px 13px;
  }

  :global(.inventory-tag__close) {
    min-width: 76px;
    min-height: 40px;
    border: 1px solid color-mix(in srgb, var(--tag-ink) 72%, transparent);
    font-family: var(--font-controls);
    font-size: 10px;
  }

  :global(.inventory-tag__close:is(:hover, :focus-visible)) {
    color: var(--tag-highlight);
    background: var(--tag-accent);
    outline: 2px solid var(--tag-highlight);
    outline-offset: -4px;
  }

  @media (max-width: 380px) {
    .inventory-tag__body {
      padding-inline: 11px;
    }

    .inventory-tag__list {
      grid-template-columns: 1fr;
    }

    .inventory-tag__list li,
    .inventory-tag__list li:nth-child(even) {
      border-right: 0;
    }

    .inventory-tag__list li:not(:last-child) {
      border-bottom: 1px solid color-mix(in srgb, var(--tag-ink) 22%, transparent);
    }

    .inventory-tag__footer {
      padding-inline: 11px;
    }
  }
</style>
