<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";

  import * as Dialog from "#lib/components/ui/dialog/index.js";

  import type { Snippet } from "svelte";

  let {
    children,
    open = $bindable(false),
    size = "wide",
  }: { children: Snippet; open?: boolean; size?: "narrow" | "wide" } = $props();
</script>

<!--
  A modal dialog drawn as a paper shipping tag hanging from a string. The frame (palette, punched
  hole, string, reinforcement ring, & entrance animation) lives here; callers supply the body and
  footer. The --tag-* palette is defined in src/app.css, so caller content can use it too.
-->
<Dialog.Root bind:open>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="tag-dialog__overlay" />
    <DialogPrimitive.Content class="tag-dialog tag-dialog--{size}">
      <div class="tag-wrap">
        <svg class="tag__string" viewBox="0 0 120 70" aria-hidden="true">
          <path d="M117 3 C89 2 82 27 60 59" />
        </svg>
        <div class="tag">
          <div class="tag__stub" aria-hidden="true">
            <span class="tag__ring"></span>
          </div>
          {@render children()}
        </div>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</Dialog.Root>

<style>
  .tag-wrap {
    position: relative;
    width: 100%;
    filter: var(--tag-shadow);
  }

  .tag {
    position: relative;
    display: flex;
    width: 100%;
    max-height: calc(100dvh - 48px);
    flex-direction: column;
    overflow: hidden;
    color: var(--tag-ink);
    background: var(--tag-paper);
    clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%, 0 14px);
    /* stylelint-disable color-no-hex -- a mask reads only alpha; #000 means "keep" */
    -webkit-mask: radial-gradient(circle at 50% 31px, transparent 0 7px, #000 7.5px);
    mask: radial-gradient(circle at 50% 31px, transparent 0 7px, #000 7.5px);
    /* stylelint-enable color-no-hex */
  }

  .tag__string {
    position: absolute;
    top: -28px;
    left: calc(50% - 60px);
    z-index: 3;
    width: 120px;
    height: 70px;
    overflow: visible;
    fill: none;
    filter: drop-shadow(var(--tag-string-shadow));
    pointer-events: none;
    stroke: var(--tag-string);
    stroke-linecap: round;
    stroke-width: 2.2;
  }

  .tag__stub {
    display: flex;
    min-height: 62px;
    align-items: center;
    flex: 0 0 auto;
    justify-content: center;
    border-bottom: 1px dashed color-mix(in srgb, var(--tag-ink) 35%, transparent);
  }

  .tag__ring {
    width: 34px;
    height: 34px;
    border: 8px solid var(--tag-accent);
    border-radius: 50%;
    background: transparent;
    box-shadow: var(--tag-ring-shadow);
  }

  .tag :global(h2) {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-style: var(--font-display-style);
    line-height: 1;
  }

  :global(.tag-dialog__overlay) {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: color-mix(in srgb, var(--paper) 72%, transparent);
  }

  :global(.tag-dialog) {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 50;
    width: calc(100% - 2rem);
    outline: none;
  }

  :global(.tag-dialog--narrow) {
    max-width: 360px;
  }

  :global(.tag-dialog--wide) {
    max-width: 430px;
  }

  :global(.tag-dialog[data-state="open"]) {
    animation: tag-dialog-enter 320ms cubic-bezier(0.22, 0.8, 0.3, 1) both;
  }

  :global(.tag-dialog[data-state="closed"]) {
    animation: tag-dialog-exit 220ms cubic-bezier(0.55, 0, 0.8, 0.35) both;
  }

  @keyframes tag-dialog-enter {
    from {
      opacity: 0;
      transform: translate(calc(-50% + 58vw), calc(-50% - 54vh)) rotate(16deg);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(-0.35deg);
    }
  }

  @keyframes tag-dialog-exit {
    from {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(-0.35deg);
    }
    to {
      opacity: 0;
      transform: translate(calc(-50% + 58vw), calc(-50% - 54vh)) rotate(16deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.tag-dialog[data-state]) {
      animation-duration: 0.01ms;
    }
  }
</style>
