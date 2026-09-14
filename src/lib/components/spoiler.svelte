<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";

  import type { Snippet } from "svelte";

  let {
    children,
    onReveal,
    revealed = false,
  }: {
    children: Snippet;
    onReveal?: () => void;
    revealed?: boolean;
  } = $props();
</script>

{#if revealed}
  <span class="spoiler-reveal" in:fade={{ duration: prefersReducedMotion.current ? 0 : 140 }}
    >{@render children()}</span
  >
{:else}
  <button
    class="inline-block min-h-11 cursor-pointer rounded-sm bg-muted-foreground/25 px-1 align-baseline transition-colors hover:bg-muted-foreground/40"
    type="button"
    onclick={onReveal}
    aria-label="Reveal spoiler"
  >
    <span class="invisible" aria-hidden="true">{@render children()}</span>
  </button>
{/if}

<style>
  .spoiler-reveal {
    display: inline;
  }
</style>
