<script lang="ts">
  import IconChevronRight from "@tabler/icons-svelte-runes/icons/chevron-right";

  import SaveDrop from "#lib/components/sync/save-drop.svelte";
  import SaveFolderPath from "#lib/components/sync/save-folder-path.svelte";
  import * as m from "#lib/paraglide/messages.js";
  import { readSaveFile } from "#lib/sync/read-save.js";
  import { AUTOSAVE_EXAMPLE } from "#lib/sync/save-folders.js";
  import { fileOf } from "#lib/sync/save-source.js";
  import { messageParts } from "#lib/utils/message-parts.js";

  import type { ReadSave } from "#lib/sync/read-save.js";
  import type { SaveFolderPlatform } from "#lib/sync/save-folders.js";
  import type { SaveSource } from "#lib/sync/save-source.js";

  let {
    hint = null,
    onread,
  }: {
    /** Shown above the drop box after “Hmm, no, try that again”. */
    hint?: null | string;
    onread: (save: ReadSave, source: SaveSource) => void;
  } = $props();

  let platform = $state<SaveFolderPlatform>("windows");
  let showOtherPlatforms = $state(false);
  let copied = $state(false);
  let showHelp = $state(false);

  const openParts = $derived(
    messageParts<"file">((slot) => {
      const file = slot("file");
      if (platform === "linux") return m.sync_find_open_linux({ file });
      if (platform === "mac") return m.sync_find_open_mac({ file });
      return m.sync_find_open({ file });
    }),
  );

  // The gate is only visual: a save dropped anyway proves the player found it.
  async function read(source: SaveSource): Promise<void> {
    onread(await readSaveFile(await fileOf(source)), source);
  }
</script>

<div class="find">
  <p>{m.sync_find_intro()}</p>

  <div class="find__half" class:find__half--active={!copied}>
    <p>{m.sync_find_copy_lead()}</p>
    <SaveFolderPath {platform} bind:copied />
    {#if showOtherPlatforms}
      <div class="find__platforms" role="radiogroup" aria-label={m.sync_find_other_os()}>
        {#each [["windows", m.sync_find_os_windows()], ["linux", m.sync_find_os_linux()], ["mac", m.sync_find_os_mac()]] as const as [value, label] (value)}
          <button
            type="button"
            role="radio"
            aria-checked={platform === value}
            class="find__platform"
            onclick={() => {
              platform = value;
            }}
          >
            {label}
          </button>
        {/each}
      </div>
      {#if platform === "linux"}
        <p class="find__hint">{m.sync_find_linux_hint()}</p>
      {/if}
    {:else}
      <button
        type="button"
        class="find__text-button"
        onclick={() => {
          showOtherPlatforms = true;
        }}
      >
        {m.sync_find_other_os()} <span aria-hidden="true">→</span>
      </button>
    {/if}
  </div>

  <div class="find__half" class:find__half--active={copied}>
    <p>
      {#each openParts as part, index (index)}
        {#if typeof part === "string"}{part}{:else}<code>{AUTOSAVE_EXAMPLE}</code>{/if}
      {/each}
    </p>
    {#if hint}
      <p class="find__hint" role="status">{hint}</p>
    {/if}
    <SaveDrop label={m.sync_find_drop()} locked={!copied} onsource={read} {platform} />

    <button
      type="button"
      class="find__help-toggle"
      aria-expanded={showHelp}
      onclick={() => {
        showHelp = !showHelp;
      }}
    >
      <IconChevronRight class={showHelp ? "rotate-90" : ""} aria-hidden="true" />
      {m.sync_find_help()}
    </button>
    {#if showHelp}
      <div class="find__help">
        <p>{m.sync_find_help_bar()}</p>
        {#if platform === "linux"}
          <p>{m.sync_find_linux_hint()}</p>
        {/if}
        <p>{m.sync_find_help_run()}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .find {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  /* One half is active at a time: an accent rule beside it, & the other half dims. Dimmed isn't
     disabled; everything in it stays usable & announced. */
  .find__half {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 11px;
    border-left: 1px solid color-mix(in srgb, var(--color-ink-hairline) 45%, transparent);
    color: color-mix(in srgb, var(--color-ink) 48%, var(--color-paper-raised));
  }

  .find__half--active {
    border-left: 3px solid var(--color-home-accent);
    padding-left: 9px;
    color: var(--color-ink);
  }

  .find code {
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    overflow-wrap: anywhere;
  }

  .find__platforms {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .find__platform {
    min-height: 32px;
    padding: 4px 10px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 50%, transparent);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
  }

  .find__platform[aria-checked="true"] {
    border-color: var(--color-home-accent);
    color: var(--color-home-accent-foreground);
    background: var(--color-home-accent);
  }

  .find__text-button,
  .find__help-toggle {
    display: inline-flex;
    width: fit-content;
    min-height: 32px;
    align-items: center;
    gap: 4px;
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
  }

  .find__help-toggle :global(svg) {
    width: 14px;
    height: 14px;
    transition: rotate 120ms ease-out;
  }

  .find__hint {
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .find__help {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 12px;
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  @media (prefers-reduced-motion: reduce) {
    .find__help-toggle :global(svg) {
      transition-duration: 0.01ms;
    }
  }
</style>
