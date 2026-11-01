<script lang="ts">
  import IconLoader2 from "@tabler/icons-svelte-runes/icons/loader-2";
  import IconUpload from "@tabler/icons-svelte-runes/icons/upload";
  import { tick } from "svelte";

  import * as m from "#lib/paraglide/messages.js";
  import { isEditing } from "#lib/pwa/safe-reload.js";
  import { browserGivesHandles, sourceFromTransfer } from "#lib/sync/save-source.js";

  import type { SaveFolderPlatform } from "#lib/sync/save-folders.js";
  import type { SaveSource } from "#lib/sync/save-source.js";

  let {
    label,
    locked = false,
    onsource,
    platform,
  }: {
    label: string;
    /** Looks inactive until the folder's been copied. The gate is only visual. */
    locked?: boolean;
    /** Takes the save file. Throwing says this one couldn't be read. */
    onsource: (source: SaveSource) => Promise<void>;
    platform: SaveFolderPlatform;
  } = $props();

  let reading = $state(false);
  let dragOver = $state(false);
  let error = $state<null | string>(null);
  let showCantDrag = $state(false);
  let box = $state<HTMLElement>();
  let fileInput = $state<HTMLInputElement>();

  const givesHandles = browserGivesHandles();
  const uid = $props.id();
  const cantDragId = `${uid}-cant-drag`;
  const lockedId = `${uid}-locked`;
  const cantDragBody = $derived.by(() => {
    if (givesHandles) {
      if (platform === "linux") return m.sync_find_cant_drag_body_linux();
      if (platform === "mac") return m.sync_find_cant_drag_body_mac();
      return m.sync_find_cant_drag_body();
    }
    if (platform === "linux") return m.sync_find_cant_drag_body_pick_linux();
    if (platform === "mac") return m.sync_find_cant_drag_body_pick_mac();
    return m.sync_find_cant_drag_body_pick();
  });

  async function take(source: SaveSource | undefined): Promise<void> {
    if (!source) return;
    reading = true;
    error = null;
    try {
      await onsource(source);
    } catch {
      error = m.sync_find_bad_file();
    } finally {
      reading = false;
      if (fileInput) fileInput.value = "";
    }
  }

  async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    dragOver = false;
    await take(await sourceFromTransfer(event.dataTransfer));
  }

  /** A paste anywhere outside a text field counts, as “Can't drag?” promises. */
  async function handlePaste(event: ClipboardEvent): Promise<void> {
    if (event.defaultPrevented || isEditing(document.activeElement)) return;
    const { clipboardData } = event;
    if (![...(clipboardData?.items ?? [])].some(({ kind }) => kind === "file")) return;
    // Behind an open panel this box can't take focus or be seen, so the panel's own one takes it.
    if (box?.closest("[inert]")) return;
    event.preventDefault();
    box?.focus();
    await take(await sourceFromTransfer(clipboardData));
  }

  async function toggleCantDrag(): Promise<void> {
    showCantDrag = !showCantDrag;
    if (!showCantDrag || !givesHandles) return;
    // A keyboard player has somewhere to paste, & hears how.
    await tick();
    box?.focus();
  }
</script>

<svelte:document onpaste={(event) => void handlePaste(event)} />

<!-- It takes focus so a keyboard player has somewhere to paste. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={box}
  class="save-drop"
  class:save-drop--locked={locked}
  class:save-drop--over={dragOver}
  role="group"
  tabindex="0"
  aria-label={label}
  aria-disabled={locked ? "true" : undefined}
  aria-describedby={[
    locked && !reading ? lockedId : undefined,
    showCantDrag ? cantDragId : undefined,
  ]
    .filter(Boolean)
    .join(" ") || undefined}
  ondragover={(event) => {
    event.preventDefault();
    dragOver = true;
  }}
  ondragleave={() => {
    dragOver = false;
  }}
  ondrop={(event) => void handleDrop(event)}
>
  {#if reading}
    <IconLoader2 class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
    <span role="status">{m.sync_find_reading()}</span>
  {:else}
    <IconUpload aria-hidden="true" />
    {#if locked}
      <span id={lockedId}>{m.sync_find_drop_locked()}</span>
    {:else}
      <span aria-hidden="true">{label}</span>
    {/if}
  {/if}
</div>
{#if error}
  <p class="save-drop__error" role="alert">{error}</p>
{/if}

<button type="button" class="save-drop__link" aria-expanded={showCantDrag} onclick={toggleCantDrag}>
  {m.sync_find_cant_drag()}
</button>
{#if showCantDrag}
  <div class="save-drop__cant-drag">
    <p id={cantDragId}>{cantDragBody}</p>
    {#if !givesHandles}
      <label class="save-drop__choose">
        {m.sync_find_choose()}
        <input
          bind:this={fileInput}
          class="sr-only"
          type="file"
          accept=".sav"
          onchange={(event) => {
            const file = event.currentTarget.files?.[0];
            void take(file && { file, kind: "file" });
          }}
        />
      </label>
    {/if}
  </div>
{/if}

<style>
  /* Photo-mount corners frame the drop box, as they frame the code. */
  .save-drop {
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

  .save-drop:focus-visible {
    outline: 2px solid var(--color-home-accent);
    outline-offset: 2px;
  }

  .save-drop:not(.save-drop--locked)::before,
  .save-drop:not(.save-drop--locked)::after {
    position: absolute;
    width: 10px;
    height: 10px;
    background: var(--color-home-accent);
    content: "";
  }

  .save-drop::before {
    top: -2px;
    left: -2px;
    clip-path: polygon(0 0, 100% 0, 0 100%);
  }

  .save-drop::after {
    right: -2px;
    bottom: -2px;
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }

  .save-drop :global(svg) {
    width: 20px;
    height: 20px;
  }

  /* Locked: a hairline border & muted icon, its label still at full contrast. */
  .save-drop--locked {
    border: 1px dashed color-mix(in srgb, var(--color-ink-hairline) 50%, transparent);
  }

  .save-drop--locked :global(svg) {
    color: var(--color-ink-muted);
    opacity: 0.6;
  }

  .save-drop--over {
    border-color: var(--color-home-accent);
    background: color-mix(in srgb, var(--color-home-accent) 8%, transparent);
  }

  .save-drop__error {
    color: var(--destructive);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .save-drop__link {
    width: fit-content;
    min-height: 24px;
    color: var(--color-status-success);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .save-drop__choose {
    display: inline-flex;
    width: fit-content;
    min-height: 32px;
    align-items: center;
    padding: 4px 10px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 60%, transparent);
    background: var(--color-paper-raised);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    cursor: pointer;
  }

  .save-drop__choose:focus-within {
    outline: 2px solid var(--color-home-accent);
    outline-offset: 2px;
  }

  .save-drop__cant-drag {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 12px;
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }
</style>
