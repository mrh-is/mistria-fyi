<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { fly } from "svelte/transition";

  import { trapFocus } from "#lib/attachments/trap-focus.js";

  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";

  let {
    children,
    closeLabel,
    element = $bindable(null),
    focus,
    label,
    onClose,
    outro = false,
    style,
  }: {
    children: Snippet;
    closeLabel: string;
    element?: HTMLElement | null;
    focus?: Attachment<HTMLElement>;
    label?: string;
    onClose: () => void;
    outro?: boolean;
    style?: string;
  } = $props();
</script>

<button
  class="fixed inset-x-0 top-[-100dvh] bottom-[-100dvh] z-0"
  type="button"
  aria-label={closeLabel}
  tabindex="-1"
  onclick={onClose}
></button>
<div
  bind:this={element}
  {@attach focus}
  {@attach label ? trapFocus(onClose) : undefined}
  class="fixed right-0 bottom-safe-offset-16 left-0 z-[var(--z-panel)] mx-auto max-w-lg px-3 outline-none"
  role={label ? "dialog" : undefined}
  aria-label={label}
  aria-modal={label ? "true" : undefined}
  tabindex="-1"
  {style}
  in:fly={{ duration: prefersReducedMotion.current ? 0 : 150, y: 8 }}
  out:fly={{ duration: outro && !prefersReducedMotion.current ? 150 : 0, y: 8 }}
>
  {@render children()}
</div>
