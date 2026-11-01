<script lang="ts">
  import IconCheck from "@tabler/icons-svelte-runes/icons/check";
  import IconCopy from "@tabler/icons-svelte-runes/icons/copy";

  import * as m from "#lib/paraglide/messages.js";
  import { copiedFromPath, SAVE_FOLDERS } from "#lib/sync/save-folders.js";

  import type { SaveFolderPlatform } from "#lib/sync/save-folders.js";

  let {
    copied = $bindable(false),
    platform,
  }: {
    /** Set by the button, or by copying the path by hand. */
    copied?: boolean;
    platform: SaveFolderPlatform;
  } = $props();

  let pathEl = $state<HTMLElement>();

  const folder = $derived(SAVE_FOLDERS[platform]);

  async function copyPath(): Promise<void> {
    try {
      await navigator.clipboard.writeText(folder);
    } catch {
      // A blocked clipboard still lifts the gate; the path stays selectable to copy by hand.
    }
    copied = true;
  }

  function handleCopyEvent(): void {
    if (pathEl && copiedFromPath(document.getSelection(), pathEl)) copied = true;
  }
</script>

<svelte:document oncopy={handleCopyEvent} />

<div class="save-folder" class:save-folder--copied={copied}>
  <code bind:this={pathEl}>{folder}</code>
  <button type="button" class="save-folder__copy" onclick={copyPath}>
    {#if copied}
      <IconCheck aria-hidden="true" />{m.sync_find_copied()}
    {:else}
      <IconCopy aria-hidden="true" />{m.sync_find_copy()}
    {/if}
  </button>
</div>

<style>
  .save-folder {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 10px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 50%, transparent);
    background: color-mix(in srgb, var(--color-paper) 80%, var(--color-ink-hairline) 10%);
  }

  .save-folder code {
    min-width: 0;
    flex: 1;
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    overflow-wrap: anywhere;
    user-select: all;
  }

  .save-folder--copied {
    border-color: var(--color-status-success);
  }

  .save-folder__copy {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 60%, transparent);
    background: var(--color-paper-raised);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
  }

  .save-folder--copied .save-folder__copy {
    border-color: var(--color-status-success);
    color: color-mix(in srgb, var(--color-status-success) 80%, var(--color-ink));
  }

  .save-folder__copy :global(svg) {
    width: 14px;
    height: 14px;
  }
</style>
