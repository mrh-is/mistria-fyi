<script lang="ts">
  import { IconX } from "@tabler/icons-svelte-runes";

  import type { Snippet } from "svelte";

  let {
    children,
    headerActions,
    id,
    onclose,
    title,
  }: {
    children: Snippet;
    headerActions?: Snippet;
    id: string;
    onclose: () => void;
    title: string;
  } = $props();
</script>

<section class="foldout" {id} aria-labelledby="{id}-title">
  <header class="foldout__header">
    <h2 class="foldout__title" id="{id}-title">{title}</h2>
    <div class="foldout__header-actions">
      {@render headerActions?.()}
    </div>
    <button class="foldout__close" type="button" aria-label="Close {title}" onclick={onclose}>
      <IconX class="size-4" />
    </button>
  </header>
  <div class="foldout__body">
    {@render children()}
  </div>
</section>

<style>
  .foldout {
    max-height: min(72dvh, 620px);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--hairline) 58%, transparent);
    background: var(--paper-raised);
    box-shadow: 0 9px 24px rgb(32 28 24 / 18%);
  }

  .foldout__header {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: space-between;
    padding-left: 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--hairline) 30%, transparent);
  }

  .foldout__title {
    flex: 1;
    font-family: var(--font-controls);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .foldout__header-actions {
    display: flex;
    align-items: center;
  }

  .foldout__close {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    color: var(--ink-muted);
  }

  .foldout__close:is(:hover, :focus-visible) {
    color: var(--ink);
    background: var(--accent);
    outline: 2px solid var(--primary);
    outline-offset: -4px;
  }

  .foldout__body {
    max-height: calc(min(72dvh, 620px) - 44px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
</style>
