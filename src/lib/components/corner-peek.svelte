<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { slide } from "svelte/transition";

  import SourceCard from "$lib/components/source-card.svelte";

  import type { DisplayBadges } from "$lib/engine/availability-condition.js";
  import type { Source } from "$lib/types/acquisition";
  import type { SourceSegment } from "$lib/utils/source-segments.js";

  let {
    contentId,
    label,
    sourceBadges,
    sources,
    sourceSegments,
  }: {
    contentId: string;
    label: string;
    sourceBadges: DisplayBadges[];
    sources: Source[];
    sourceSegments: SourceSegment[][];
  } = $props();

  let expanded = $state(false);
</script>

<div class="corner-peek">
  <!-- The control stays anchored to the row edge while the child paper expands below it. -->
  <button
    class="corner-peek__grab"
    type="button"
    aria-expanded={expanded}
    aria-controls={contentId}
    aria-label={label}
    onclick={() => {
      expanded = !expanded;
    }}
  >
    <svg class="corner-peek__surface" viewBox="0 0 26 26" aria-hidden="true">
      <path d="M25.5 0.5v25H0.5Z" />
    </svg>
    <svg
      class="corner-peek__chevron"
      class:corner-peek__chevron--open={expanded}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 1L7 5L3 9"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>

  {#if expanded}
    <div
      id={contentId}
      class="corner-peek__card"
      transition:slide={{ duration: prefersReducedMotion.current ? 0 : 150 }}
    >
      <SourceCard {sources} {sourceSegments} {sourceBadges} />
    </div>
  {/if}
</div>

<style>
  .corner-peek {
    position: relative;
    z-index: 2;
  }

  .corner-peek__grab {
    position: absolute;
    right: 0;
    bottom: 100%;
    z-index: 2;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    border-radius: 2px;
  }

  .corner-peek__surface {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 26px;
    height: 26px;
    transition: filter 180ms ease;
    pointer-events: none;
  }

  .corner-peek__surface path {
    fill: var(--paper-deep);
    stroke: color-mix(in srgb, var(--hairline) 48%, transparent);
    stroke-linejoin: round;
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }

  .corner-peek__chevron {
    position: relative;
    z-index: 1;
    width: 9px;
    height: 9px;
    color: var(--ink-muted);
    transition: transform 200ms ease;
    transform: rotate(45deg);
  }

  .corner-peek__chevron--open {
    transform: rotate(-135deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .corner-peek__chevron,
    .corner-peek__surface {
      transition: none;
    }
  }

  .corner-peek__grab:is(:hover, :focus-visible) {
    outline: none;
  }

  .corner-peek__grab:is(:hover, :focus-visible) .corner-peek__surface {
    filter: brightness(0.96) saturate(1.08);
  }

  .corner-peek__grab:focus-visible .corner-peek__surface {
    filter: drop-shadow(0 0 1px var(--ink)) brightness(0.96);
  }

  .corner-peek__card {
    position: relative;
    z-index: 1;
    margin-inline: 7px;
    background: var(--paper-deep);
    padding: 7px 11px 8px;
    border-inline: 1px solid color-mix(in srgb, var(--hairline) 24%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--hairline) 30%, transparent);
    box-shadow: inset 0 2px 4px -3px rgb(0 0 0 / 18%);
  }

  :global(.dark) .corner-peek__card {
    box-shadow: inset 0 2px 4px -2px rgb(0 0 0 / 0.3);
  }
</style>
