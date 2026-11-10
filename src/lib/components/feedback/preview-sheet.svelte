<script lang="ts" module>
  /** The extras that send data, and so have something to preview. */
  export type Preview = "progress" | "syncLog";
</script>

<script lang="ts">
  import XIcon from "@tabler/icons-svelte-runes/icons/x";
  import { Dialog as DialogPrimitive } from "bits-ui";

  import VisibilityTag from "#lib/components/feedback/visibility-tag.svelte";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import { outlineLines } from "#lib/feedback/outline.js";
  import * as m from "#lib/ui-messages/messages.js";

  import type { OutlineLine } from "#lib/feedback/outline.js";

  let {
    attached,
    data,
    onAttachedChange,
    open = $bindable(false),
    preview,
  }: {
    /** Whether the extra is on; the footer's toggle mirrors the form's row. */
    attached: boolean;
    /** Exactly what the extra sends. */
    data: unknown;
    onAttachedChange: (attached: boolean) => void;
    open?: boolean;
    preview: Preview;
  } = $props();

  let copy = $derived(
    preview === "progress"
      ? {
          attach: m.feedback_attach_progress_label(),
          removed: m.feedback_preview_progress_removed(),
          title: m.feedback_preview_progress_title(),
        }
      : {
          attach: m.feedback_attach_sync_log(),
          removed: m.feedback_preview_sync_log_removed(),
          title: m.feedback_preview_sync_log_title(),
        },
  );
  // Kept while the sheet slides away, after the caller stops computing its data.
  let lines = $state<OutlineLine[]>([]);
  $effect(() => {
    if (open) lines = outlineLines(data);
  });
  const DASH = "- ";
</script>

<!-- Lets a long identifier like festival_lantern_blue wrap after an underscore, never mid-word. -->
{#snippet breakable(text: string)}
  {#each text.split("_") as part, index (index)}{#if index > 0}_<wbr />{/if}{part}{/each}
{/snippet}

<!--
  A supplemental page of dot-grid paper that slides up over the form, scoped to feedback. Its dots
  line up with the type: one column per mono character plus its tracking, one row per line.
-->
<DialogPrimitive.Root bind:open>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="preview-sheet__overlay" />
    <DialogPrimitive.Content class="preview-sheet">
      <div class="preview-sheet__header">
        <div class="preview-sheet__heading">
          <DialogPrimitive.Title class="preview-sheet__title">{copy.title}</DialogPrimitive.Title>
          <VisibilityTag visibility="public" />
        </div>
        <DialogPrimitive.Description class="preview-sheet__subtitle">
          {m.feedback_preview_subtitle()}
        </DialogPrimitive.Description>
        <DialogPrimitive.Close class="preview-sheet__close">
          <XIcon class="size-5" aria-hidden="true" />
          <span class="sr-only">{m.common_close()}</span>
        </DialogPrimitive.Close>
      </div>
      <!-- A keyboard stop, so the outline scrolls without a pointer. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="preview-sheet__data"
        data-preview={preview}
        role="region"
        aria-label={copy.title}
        tabindex="0"
      >
        {#each lines as line, index (index)}
          <div class="preview-sheet__line" style="--hang: {line.hang}">
            {" ".repeat(line.lead)}{#if line.dash}<span class="preview-sheet__dash">{DASH}</span
              >{/if}{#if line.key !== undefined}<span class="preview-sheet__key"
                >{@render breakable(line.key)}:</span
              >{/if}{#if line.value}<span
                class="preview-sheet__value preview-sheet__value--{line.value.kind}"
                >{line.key === undefined ? "" : " "}{@render breakable(line.value.text)}</span
              >{/if}
          </div>
        {/each}
      </div>
      <div class="preview-sheet__footer">
        <p>{copy.removed}</p>
        <div class="preview-sheet__attach">
          <Checkbox
            class="rounded-sm"
            id="preview-sheet-attach"
            checked={attached}
            onCheckedChange={onAttachedChange}
          />
          <label for="preview-sheet-attach">{copy.attach}</label>
        </div>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style>
  :global(.preview-sheet__overlay) {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    background: color-mix(in srgb, var(--color-ink) 22%, transparent);
  }

  :global(.preview-sheet) {
    --preview-sheet-tilt: -0.6deg;

    position: fixed;
    bottom: 0;
    left: 50%;
    z-index: var(--z-dialog);
    display: flex;
    width: min(calc(100% - 16px), 30rem);
    max-height: min(85dvh, 720px);
    flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 45%, transparent);
    border-bottom: 0;
    background: var(--color-paper-raised);
    box-shadow: var(--shadow-large);
    outline: none;
    transform: translateX(-50%) rotate(var(--preview-sheet-tilt));
    transform-origin: 50% 100%;
  }

  :global(.preview-sheet[data-state="open"]) {
    animation: preview-sheet-enter 260ms cubic-bezier(0.22, 0.8, 0.3, 1) both;
  }

  :global(.preview-sheet[data-state="closed"]) {
    animation: preview-sheet-exit 180ms cubic-bezier(0.55, 0, 0.8, 0.35) both;
  }

  @keyframes preview-sheet-enter {
    from {
      transform: translateX(-50%) translateY(100%) rotate(0);
    }
    to {
      transform: translateX(-50%) rotate(var(--preview-sheet-tilt));
    }
  }

  @keyframes preview-sheet-exit {
    from {
      transform: translateX(-50%) rotate(var(--preview-sheet-tilt));
    }
    to {
      transform: translateX(-50%) translateY(100%) rotate(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.preview-sheet[data-state]) {
      animation-duration: 0.01ms;
    }
  }

  .preview-sheet__header {
    position: relative;
    padding: 16px 52px 10px 18px;
    border-bottom: 1px dashed color-mix(in srgb, var(--color-ink-hairline) 60%, transparent);
  }

  .preview-sheet__heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
  }

  .preview-sheet__header :global(.preview-sheet__title) {
    font-family: var(--font-controls);
    font-size: var(--text-xs);
    font-variant-caps: all-small-caps;
    letter-spacing: 0.14em;
  }

  .preview-sheet__header :global(.preview-sheet__subtitle) {
    margin-top: 2px;
    color: var(--color-ink-muted);
    font-size: var(--text-sm);
  }

  .preview-sheet__header :global(.preview-sheet__close) {
    position: absolute;
    top: 4px;
    right: 4px;
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    color: var(--color-ink-muted);
  }

  .preview-sheet__header :global(.preview-sheet__close:is(:hover, :focus-visible)) {
    color: var(--color-ink);
    outline: 2px solid var(--primary);
    outline-offset: -6px;
  }

  .preview-sheet__data {
    --fs: var(--text-xs);
    --ls: 1.6px;
    /* IBM Plex Mono advances 0.6em per character; the tracking makes room for one dot. */
    --cw: calc(var(--fs) * 0.6 + var(--ls));
    --lh: calc(var(--fs) * 4 / 3);
    --padx: 18px;
    --pady: 12px;

    min-height: 0;
    flex: 1;
    overflow: auto;
    padding: var(--pady) var(--padx);
    color: var(--color-ink);
    background-attachment: local;
    background-image: radial-gradient(
      circle,
      color-mix(in srgb, var(--color-ink-hairline) 30%, transparent) 0.85px,
      transparent 1.05px
    );
    /* Each dot sits in the gap after a character, and on each line boundary. */
    background-position: calc(var(--padx) + var(--cw) / 2 - var(--ls) / 2)
      calc(var(--pady) - var(--lh) / 2);
    background-size: var(--cw) var(--lh);
    font-family: var(--font-data);
    font-size: var(--fs);
    letter-spacing: var(--ls);
    line-height: var(--lh);
  }

  .preview-sheet__data:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  /* Its indent is real spaces, for copying; a wrapped line hangs just past its key. */
  .preview-sheet__line {
    padding-inline-start: calc(var(--hang) * var(--cw));
    overflow-wrap: anywhere;
    text-indent: calc(-1 * var(--hang) * var(--cw));
    white-space: pre-wrap;
  }

  .preview-sheet__key,
  .preview-sheet__dash {
    color: var(--color-ink-muted);
  }

  .preview-sheet__value--number {
    color: var(--color-feedback-outline-number);
  }

  .preview-sheet__value--boolean {
    color: var(--color-feedback-outline-boolean);
  }

  .preview-sheet__value--redacted {
    color: var(--color-feedback-outline-redacted);
  }

  .preview-sheet__value--null,
  .preview-sheet__value--empty {
    color: var(--color-ink-muted);
  }

  .preview-sheet__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 12px;
    padding: 8px 18px max(10px, env(safe-area-inset-bottom));
    border-top: 1px dashed color-mix(in srgb, var(--color-ink-hairline) 60%, transparent);
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .preview-sheet__footer p {
    min-width: 0;
    flex: 1 1 14rem;
  }

  .preview-sheet__attach {
    position: relative;
    display: flex;
    min-height: 44px;
    align-items: center;
    gap: 8px;
    color: var(--color-ink);
    font-family: var(--font-controls);
  }

  .preview-sheet__attach label {
    cursor: pointer;
    user-select: none;
  }
</style>
