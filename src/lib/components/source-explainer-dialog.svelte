<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";

  import * as Dialog from "$lib/components/ui/dialog/index.js";

  import type { SourceFilter } from "$lib/stores/toolbar-state.svelte.js";

  let { filters, open = $bindable(false) }: { filters: SourceFilter[]; open?: boolean } = $props();
</script>

<Dialog.Root bind:open>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="source-dialog__overlay" />
    <DialogPrimitive.Content class="source-dialog">
      <div class="inventory-tag-wrap">
        <svg class="inventory-tag__string" viewBox="0 0 100 65" aria-hidden="true">
          <path d="M96 3 C70 1 58 28 43 61" />
        </svg>
        <div class="inventory-tag">
          <div class="inventory-tag__stub" aria-hidden="true">
            <span class="inventory-tag__ring"><i></i></span>
          </div>
          <div class="inventory-tag__body">
            <div class="inventory-tag__heading">
              <span class="inventory-tag__overline">Field Guide inventory</span>
              <Dialog.Title>Source groups</Dialog.Title>
              <Dialog.Description class="sr-only"
                >The source filter groups shown in the filter panel.</Dialog.Description
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
            <div class="inventory-tag__footer">
              <Dialog.Close class="inventory-tag__close">Got it</Dialog.Close>
            </div>
          </div>
        </div>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</Dialog.Root>

<style>
  .inventory-tag-wrap {
    --tag-accent: #a65343;
    --tag-ink: #382d24;
    --tag-muted: #695647;
    --tag-paper-end: #e9c98f;
    --tag-paper-middle: #f0d8aa;

    position: relative;
    width: 100%;
  }

  :global(.dark) .inventory-tag-wrap {
    --tag-accent: #c36d5a;
    --tag-ink: #eee3d2;
    --tag-muted: #c7b7a1;
    --tag-paper-end: #34302b;
    --tag-paper-middle: #413a31;
  }

  .inventory-tag {
    position: relative;
    display: grid;
    grid-template-columns: 74px minmax(0, 1fr);
    width: 100%;
    max-height: calc(100dvh - 48px);
    overflow-y: auto;
    color: var(--tag-ink);
    background: linear-gradient(
      104deg,
      var(--tag-paper-end),
      var(--tag-paper-middle) 48%,
      var(--tag-paper-end)
    );
    box-shadow: 4px 9px 18px rgb(31 23 15 / 24%);
    -webkit-mask: radial-gradient(circle at 37px 35px, transparent 0 7px, #000 7.5px);
    mask: radial-gradient(circle at 37px 35px, transparent 0 7px, #000 7.5px);
  }

  .inventory-tag__string {
    position: absolute;
    top: -26px;
    left: -6px;
    z-index: 3;
    width: 100px;
    height: 65px;
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
    align-items: center;
    flex-direction: column;
    justify-content: flex-start;
    padding-top: 18px;
    border-right: 1px dashed color-mix(in srgb, var(--tag-ink) 35%, transparent);
  }

  .inventory-tag__ring {
    position: relative;
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 50%;
    background: var(--tag-accent);
    box-shadow:
      inset 0 0 0 2px color-mix(in srgb, var(--tag-accent) 72%, #000),
      0 1px 1px rgb(57 36 23 / 22%);
  }

  .inventory-tag__ring i {
    width: 14px;
    height: 14px;
    border-radius: 50%;
  }

  .inventory-tag__body {
    min-width: 0;
    padding: 15px 16px 13px;
  }

  .inventory-tag__heading {
    padding-bottom: 8px;
    border-bottom: 2px solid color-mix(in srgb, var(--tag-ink) 74%, transparent);
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
    font-style: italic;
    line-height: 1;
  }

  .inventory-tag__list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .inventory-tag__list li {
    display: flex;
    min-width: 0;
    gap: 7px;
    padding: 7px 6px;
    border-right: 1px solid color-mix(in srgb, var(--tag-ink) 42%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--tag-ink) 42%, transparent);
  }

  .inventory-tag__list li:nth-child(even) {
    border-right: 0;
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
    align-items: end;
    justify-content: end;
    padding-top: 8px;
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
    .inventory-tag {
      grid-template-columns: 62px minmax(0, 1fr);
      -webkit-mask: radial-gradient(circle at 31px 35px, transparent 0 7px, #000 7.5px);
      mask: radial-gradient(circle at 31px 35px, transparent 0 7px, #000 7.5px);
    }

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

    .inventory-tag__string {
      left: -12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.source-dialog[data-state]) {
      animation-duration: 0.01ms;
    }
  }
</style>
