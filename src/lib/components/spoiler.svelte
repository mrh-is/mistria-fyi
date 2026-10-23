<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";

  import * as m from "#lib/paraglide/messages.js";

  import type { Snippet } from "svelte";

  let {
    children,
    onReveal,
    spoilered = true,
  }: {
    children: Snippet;
    onReveal?: () => void;
    spoilered?: boolean;
  } = $props();
</script>

{#if spoilered}
  <button
    class="spoiler-cover"
    type="button"
    onclick={onReveal}
    aria-label={m.spoiler_reveal_aria()}
  >
    <span class="spoiler-cover__mask" data-testid="spoiler-cover-mask" aria-hidden="true"
      ><span class="spoiler-cover__content">{@render children()}</span></span
    >
  </button>
{:else}
  <span class="spoiler-reveal" in:fade={{ duration: prefersReducedMotion.current ? 0 : 140 }}
    >{@render children()}</span
  >
{/if}

<style>
  .spoiler-reveal {
    display: inline;
  }

  /*
   * The button is the accessible target; the mask is the visible cover.
   * Vertically, padding grows the button to the target size and a matching
   * negative margin cancels it out of the line box, so prose and rows keep
   * their natural line height. Horizontally, a centered pseudo-element widens
   * the hit area to the target size without shifting surrounding text.
   */
  .spoiler-cover {
    --spoiler-target: var(--tracker-target-size, 44px);
    --spoiler-pad-block: max(0px, calc((var(--spoiler-target) - 1lh) / 2));
    position: relative;
    display: inline-block;
    vertical-align: baseline;
    box-sizing: border-box;
    min-block-size: var(--spoiler-target);
    padding-block: var(--spoiler-pad-block);
    margin-block: calc(-1 * var(--spoiler-pad-block));
    cursor: pointer;
  }

  .spoiler-cover::before {
    content: "";
    position: absolute;
    inset-block: 0;
    inset-inline: min(0px, calc((100% - var(--spoiler-target)) / 2));
  }

  .spoiler-cover__mask {
    display: inline-block;
    padding-inline: 4px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--muted-foreground) 25%, transparent);
    transition: background-color 150ms;
  }

  .spoiler-cover__content {
    visibility: hidden;
  }

  .spoiler-cover:active .spoiler-cover__mask {
    background: color-mix(in srgb, var(--muted-foreground) 40%, transparent);
  }

  @media (hover: hover) {
    .spoiler-cover:hover .spoiler-cover__mask {
      background: color-mix(in srgb, var(--muted-foreground) 40%, transparent);
    }
  }

  .spoiler-cover:focus-visible {
    outline: none;
  }

  .spoiler-cover:focus-visible .spoiler-cover__mask {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }
</style>
