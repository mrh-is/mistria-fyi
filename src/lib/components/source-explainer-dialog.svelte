<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";

  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as m from "$lib/paraglide/messages.js";

  import type { SourceFilter } from "$lib/stores/toolbar-state.svelte.js";

  let { filters, open = $bindable(false) }: { filters: SourceFilter[]; open?: boolean } = $props();
</script>

<Dialog.Root bind:open>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="source-dialog__overlay" />
    <DialogPrimitive.Content class="source-dialog">
      <div class="inventory-tag-wrap">
        <svg class="inventory-tag__string" viewBox="0 0 120 70" aria-hidden="true">
          <path d="M117 3 C89 2 82 27 60 59" />
        </svg>
        <div class="inventory-tag">
          <div class="inventory-tag__stub" aria-hidden="true">
            <span class="inventory-tag__ring"></span>
          </div>
          <div class="inventory-tag__body">
            <div class="inventory-tag__heading">
              <span class="inventory-tag__overline">{m.source_explainer_overline()}</span>
              <Dialog.Title>{m.visibility_source_types()}</Dialog.Title>
              <Dialog.Description class="sr-only"
                >{m.source_explainer_description()}</Dialog.Description
              >
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
        </div>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</Dialog.Root>

<style>
  .inventory-tag-wrap {
    --tag-accent: #a65343;
    --tag-ink: #312e2b;
    --tag-muted: #68635e;
    --tag-paper: #e2dace;

    position: relative;
    width: 100%;
    filter: drop-shadow(1px -2px 6px rgb(31 23 15 / 18%))
      drop-shadow(3px 8px 16px rgb(31 23 15 / 28%));
  }

  :global(.dark) .inventory-tag-wrap {
    --tag-accent: #c36d5a;
    --tag-ink: #e8e3dc;
    --tag-muted: #aaa39b;
    --tag-paper: #352f2a;
  }

  .inventory-tag {
    position: relative;
    display: flex;
    width: 100%;
    max-height: calc(100dvh - 48px);
    flex-direction: column;
    overflow: hidden;
    color: var(--tag-ink);
    background: var(--tag-paper);
    clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%, 0 14px);
    -webkit-mask: radial-gradient(circle at 50% 31px, transparent 0 7px, #000 7.5px);
    mask: radial-gradient(circle at 50% 31px, transparent 0 7px, #000 7.5px);
  }

  .inventory-tag__string {
    position: absolute;
    top: -28px;
    left: calc(50% - 60px);
    z-index: 3;
    width: 120px;
    height: 70px;
    overflow: visible;
    fill: none;
    filter: drop-shadow(0 1px 1px rgb(0 0 0 / 30%));
    pointer-events: none;
    stroke: color-mix(in srgb, var(--tag-ink) 35%, #fff);
    stroke-linecap: round;
    stroke-width: 2.2;
  }

  .inventory-tag__stub {
    display: flex;
    min-height: 62px;
    align-items: center;
    flex: 0 0 auto;
    justify-content: center;
    border-bottom: 1px dashed color-mix(in srgb, var(--tag-ink) 35%, transparent);
  }

  .inventory-tag__ring {
    width: 34px;
    height: 34px;
    border: 8px solid var(--tag-accent);
    border-radius: 50%;
    background: transparent;
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--tag-accent) 60%, #000),
      0 0 0 1px color-mix(in srgb, var(--tag-accent) 68%, #000),
      0 1px 1px rgb(57 36 23 / 22%);
  }

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
    font-family: var(--font-display);
    font-size: 24px;
    font-style: var(--font-display-style);
    line-height: 1;
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
    color: #fff8e9;
    background: var(--tag-accent);
    outline: 2px solid #fff8e9;
    outline-offset: -4px;
  }

  :global(.source-dialog__overlay) {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: color-mix(in srgb, var(--paper) 72%, transparent);
  }

  :global(.source-dialog) {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 50;
    width: calc(100% - 2rem);
    max-width: 430px;
    outline: none;
  }

  :global(.source-dialog[data-state="open"]) {
    animation: source-tag-enter 320ms cubic-bezier(0.22, 0.8, 0.3, 1) both;
  }

  :global(.source-dialog[data-state="closed"]) {
    animation: source-tag-exit 220ms cubic-bezier(0.55, 0, 0.8, 0.35) both;
  }

  @keyframes source-tag-enter {
    from {
      opacity: 0;
      transform: translate(calc(-50% + 58vw), calc(-50% - 54vh)) rotate(16deg);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(-0.35deg);
    }
  }

  @keyframes source-tag-exit {
    from {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(-0.35deg);
    }
    to {
      opacity: 0;
      transform: translate(calc(-50% + 58vw), calc(-50% - 54vh)) rotate(16deg);
    }
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

  @media (prefers-reduced-motion: reduce) {
    :global(.source-dialog[data-state]) {
      animation-duration: 0.01ms;
    }
  }
</style>
