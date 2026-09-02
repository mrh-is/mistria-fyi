<script lang="ts">
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
  {@render children()}
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
