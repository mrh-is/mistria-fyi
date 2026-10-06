<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { fly } from "svelte/transition";

  import { trapFocus } from "#lib/attachments/trap-focus.js";

  import type { Snippet } from "svelte";

  let {
    children,
    closeLabel,
    element = $bindable(null),
    label,
    onclose,
    outro = false,
    style,
  }: {
    children: Snippet;
    closeLabel: string;
    element?: HTMLElement | null;
    label?: string;
    onclose: () => void;
    outro?: boolean;
    style?: string;
  } = $props();
</script>

<button
  class="fixed inset-x-0 top-[-100dvh] bottom-[-100dvh] z-0"
  type="button"
  aria-label={closeLabel}
  tabindex="-1"
  onclick={onclose}
></button>
<div
  bind:this={element}
  {@attach label ? trapFocus(onclose) : undefined}
  class="fixed right-0 bottom-safe-offset-16 left-0 z-30 mx-auto max-w-lg px-3 outline-none"
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
