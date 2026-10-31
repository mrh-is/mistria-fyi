<script lang="ts">
  import TagDialog from "#lib/components/tag-dialog.svelte";
  import * as Dialog from "#lib/components/ui/dialog/index.js";

  import type { Snippet } from "svelte";

  export interface SyncDialogAction {
    label: string;
    onclick: () => void;
    /** The button the dialog argues for, drawn in the tag's accent. */
    primary?: boolean;
  }

  let {
    actions,
    body,
    children,
    onOpenChange,
    open = $bindable(false),
    title,
  }: {
    actions: readonly SyncDialogAction[];
    body: string;
    children?: Snippet;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
    title: string;
  } = $props();

  $effect(() => {
    onOpenChange?.(open);
  });
</script>

<!-- The sync dialogs share one shape: a title, a paragraph or two, & a row of tag buttons. -->
<TagDialog bind:open size="narrow">
  <div class="sync-tag__body">
    <Dialog.Title class="sync-tag__title">{title}</Dialog.Title>
    <Dialog.Description class="sync-tag__description">{body}</Dialog.Description>
    {@render children?.()}
  </div>
  <div class="sync-tag__actions" style="--sync-tag-columns: {actions.length}">
    {#each actions as action (action.label)}
      <button
        type="button"
        class="sync-tag__action"
        class:sync-tag__action--primary={action.primary}
        onclick={action.onclick}
      >
        {action.label}
      </button>
    {/each}
  </div>
</TagDialog>

<style>
  .sync-tag__body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 15px 16px 4px;
    border-top: 1px dashed color-mix(in srgb, var(--color-tag-ink) 32%, transparent);
  }

  .sync-tag__body :global(h2.sync-tag__title) {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-style: italic;
    line-height: 1.15;
  }

  .sync-tag__body :global(.sync-tag__description),
  .sync-tag__body :global(p) {
    color: var(--color-tag-ink);
    font-family: var(--font-annotation);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .sync-tag__actions {
    display: grid;
    grid-template-columns: repeat(var(--sync-tag-columns), minmax(0, 1fr));
    gap: 6px;
    padding: 10px 16px 14px;
  }

  .sync-tag__action {
    min-height: 44px;
    padding: 6px 8px;
    border: 1px solid color-mix(in srgb, var(--color-tag-ink) 72%, transparent);
    color: var(--color-tag-ink);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
    line-height: 1.25;
  }

  .sync-tag__action--primary {
    border-color: var(--color-tag-accent);
    color: var(--color-tag-highlight);
    background: var(--color-tag-accent);
  }

  .sync-tag__action:is(:hover, :focus-visible) {
    outline: 2px solid var(--color-tag-accent);
    outline-offset: 2px;
  }

  @media (max-width: 380px) {
    .sync-tag__actions {
      grid-template-columns: 1fr;
    }
  }
</style>
