<script lang="ts">
  import IconCheck from "@tabler/icons-svelte-runes/icons/check";
  import IconChevronRight from "@tabler/icons-svelte-runes/icons/chevron-right";
  import IconCopy from "@tabler/icons-svelte-runes/icons/copy";
  import IconLoader2 from "@tabler/icons-svelte-runes/icons/loader-2";
  import IconUpload from "@tabler/icons-svelte-runes/icons/upload";

  import * as m from "#lib/paraglide/messages.js";
  import { readSaveFile } from "#lib/sync/read-save.js";
  import { messageParts } from "#lib/utils/message-parts.js";

  import { AUTOSAVE_EXAMPLE, copiedFromPath, SAVE_FOLDERS } from "./save-folders.js";

  import type { ReadSave } from "#lib/sync/read-save.js";

  import type { SaveFolderPlatform } from "./save-folders.js";

  let {
    hint = null,
    onread,
  }: {
    /** Shown above the drop box after “Hmm, no, try that again”. */
    hint?: null | string;
    onread: (save: ReadSave) => void;
  } = $props();

  let platform = $state<SaveFolderPlatform>("windows");
  let showOtherPlatforms = $state(false);
  let copied = $state(false);
  let showCantDrag = $state(false);
  let showHelp = $state(false);
  let reading = $state(false);
  let dragOver = $state(false);
  let error = $state<null | string>(null);
  let pathEl = $state<HTMLElement>();
  let fileInput = $state<HTMLInputElement>();

  const folder = $derived(SAVE_FOLDERS[platform]);
  const openParts = $derived(
    messageParts<"file">((slot) => {
      const file = slot("file");
      if (platform === "linux") return m.sync_find_open_linux({ file });
      if (platform === "mac") return m.sync_find_open_mac({ file });
      return m.sync_find_open({ file });
    }),
  );

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

  async function read(file: File | undefined): Promise<void> {
    if (!file) return;
    reading = true;
    error = null;
    try {
      onread(await readSaveFile(file));
    } catch {
      error = m.sync_find_bad_file();
    } finally {
      reading = false;
      if (fileInput) fileInput.value = "";
    }
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    dragOver = false;
    // The gate is only visual: a save dropped anyway proves the player found it.
    void read(event.dataTransfer?.files[0]);
  }
</script>

<svelte:document oncopy={handleCopyEvent} />

<div class="find">
  <p>{m.sync_find_intro()}</p>

  <div class="find__half" class:find__half--active={!copied}>
    <p>{m.sync_find_copy_lead()}</p>
    <div class="find__path" class:find__path--copied={copied}>
      <code bind:this={pathEl}>{folder}</code>
      <button type="button" class="find__copy" onclick={copyPath}>
        {#if copied}
          <IconCheck aria-hidden="true" />{m.sync_find_copied()}
        {:else}
          <IconCopy aria-hidden="true" />{m.sync_find_copy()}
        {/if}
      </button>
    </div>
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
    <div
      class="find__drop"
      class:find__drop--locked={!copied}
      class:find__drop--over={dragOver}
      role="group"
      aria-label={m.sync_find_drop()}
      aria-disabled={copied ? undefined : "true"}
      aria-describedby={copied || reading ? undefined : "sync-find-drop-locked"}
      ondragover={(event) => {
        event.preventDefault();
        dragOver = true;
      }}
      ondragleave={() => {
        dragOver = false;
      }}
      ondrop={handleDrop}
    >
      {#if reading}
        <IconLoader2 class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span role="status">{m.sync_find_reading()}</span>
      {:else}
        <IconUpload aria-hidden="true" />
        {#if copied}
          <span aria-hidden="true">{m.sync_find_drop()}</span>
        {:else}
          <span id="sync-find-drop-locked">{m.sync_find_drop_locked()}</span>
        {/if}
      {/if}
    </div>
    {#if error}
      <p class="find__error" role="alert">{error}</p>
    {/if}

    <button
      type="button"
      class="find__link"
      aria-expanded={showCantDrag}
      onclick={() => {
        showCantDrag = !showCantDrag;
      }}
    >
      {m.sync_find_cant_drag()}
    </button>
    {#if showCantDrag}
      <div class="find__cant-drag">
        <p>{m.sync_find_cant_drag_body()}</p>
        <label class="sync-small-button">
          {m.sync_find_choose()}
          <input
            bind:this={fileInput}
            class="sr-only"
            type="file"
            accept=".sav"
            onchange={(event) => void read(event.currentTarget.files?.[0])}
          />
        </label>
      </div>
    {/if}

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

  .find__path {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 10px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 50%, transparent);
    background: color-mix(in srgb, var(--color-paper) 80%, var(--color-ink-hairline) 10%);
  }

  .find__path code {
    min-width: 0;
    flex: 1;
    user-select: all;
  }

  .find__path--copied {
    border-color: var(--color-status-success);
  }

  .find__copy {
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

  .find__path--copied .find__copy {
    border-color: var(--color-status-success);
    color: color-mix(in srgb, var(--color-status-success) 80%, var(--color-ink));
  }

  .find__copy :global(svg) {
    width: 14px;
    height: 14px;
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

  /* Photo-mount corners frame the drop box, as they frame the code. */
  .find__drop {
    position: relative;
    display: flex;
    min-height: 96px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 14px;
    border: 2px dashed color-mix(in srgb, var(--color-ink-hairline) 70%, transparent);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
    text-align: center;
  }

  .find__drop:not(.find__drop--locked)::before,
  .find__drop:not(.find__drop--locked)::after {
    position: absolute;
    width: 10px;
    height: 10px;
    background: var(--color-home-accent);
    content: "";
  }

  .find__drop::before {
    top: -2px;
    left: -2px;
    clip-path: polygon(0 0, 100% 0, 0 100%);
  }

  .find__drop::after {
    right: -2px;
    bottom: -2px;
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }

  .find__drop :global(svg) {
    width: 20px;
    height: 20px;
  }

  /* Locked: a hairline border & muted icon, its label still at full contrast. */
  .find__drop--locked {
    border: 1px dashed color-mix(in srgb, var(--color-ink-hairline) 50%, transparent);
  }

  .find__drop--locked :global(svg) {
    color: var(--color-ink-muted);
    opacity: 0.6;
  }

  .find__drop--over {
    border-color: var(--color-home-accent);
    background: color-mix(in srgb, var(--color-home-accent) 8%, transparent);
  }

  .find__error {
    color: var(--destructive);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .find__link {
    width: fit-content;
    min-height: 24px;
    color: var(--color-status-success);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .find__cant-drag,
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
