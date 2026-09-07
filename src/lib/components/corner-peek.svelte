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

<!-- Grab triangle: visible through the notch in the row paper -->
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

<!-- Source card: slides out below the row -->
{#if expanded}
  <div
    id={contentId}
    class="corner-peek__card"
    transition:slide={{ duration: prefersReducedMotion.current ? 0 : 150 }}
  >
    <SourceCard {sources} {sourceSegments} {sourceBadges} />
  </div>
{/if}

<style>
  .corner-peek__grab {
    position: absolute;
    right: 0;
    bottom: 0;
    z-index: 2;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 6px;
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .corner-peek__grab::before {
    content: "";
    position: absolute;
    right: 0;
    bottom: 0;
    width: 26px;
    height: 26px;
    background: var(--paper-deep);
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }

  .corner-peek__grab::after {
    content: "";
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 20px;
    height: 1px;
    background: var(--hairline);
    transform: rotate(-45deg);
    transform-origin: right bottom;
    pointer-events: none;
  }

  .corner-peek__chevron {
    position: relative;
    z-index: 1;
    width: 10px;
    height: 10px;
    color: var(--ink-muted);
    transition: transform 200ms ease;
    transform: rotate(45deg);
  }

  .corner-peek__chevron--open {
    transform: rotate(-135deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .corner-peek__chevron {
      transition: none;
    }
  }

  .corner-peek__card {
    position: relative;
    z-index: 1;
    background: var(--paper-deep);
    padding: 8px 12px;
    box-shadow: inset 0 2px 4px -2px rgb(0 0 0 / 0.1);
  }

  :global(.dark) .corner-peek__card {
    box-shadow: inset 0 2px 4px -2px rgb(0 0 0 / 0.3);
  }
</style>
