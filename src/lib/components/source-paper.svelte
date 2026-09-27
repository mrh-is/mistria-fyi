<script lang="ts">
  import SourceCard from "$lib/components/source-card.svelte";

  import type { DisplayBadges } from "$lib/engine/availability-condition.js";
  import type { Source } from "$lib/types/acquisition";
  import type { SourceSegment } from "$lib/utils/source-segments.js";

  let {
    contentId,
    expanded,
    label,
    onToggle,
    sourceBadges,
    sources,
    sourceSegments,
  }: {
    contentId: string;
    expanded: boolean;
    label: string;
    onToggle: () => void;
    sourceBadges: DisplayBadges[];
    sources: Source[];
    sourceSegments: SourceSegment[][];
  } = $props();
</script>

<div class="source-paper" class:source-paper--open={expanded} data-source-paper>
  <div class="source-paper__surface" aria-hidden="true"></div>

  <div
    id={contentId}
    class="source-paper__panel"
    class:source-paper__panel--open={expanded}
    aria-hidden={!expanded}
    inert={!expanded}
  >
    <div class="source-paper__clip">
      <div class="source-paper__content">
        <SourceCard {sources} {sourceSegments} {sourceBadges} />
      </div>
    </div>
  </div>

  <button
    class="source-paper__control"
    type="button"
    aria-expanded={expanded}
    aria-controls={contentId}
    aria-label={label}
    onclick={onToggle}
  >
    <svg
      class="source-paper__chevron"
      class:source-paper__chevron--open={expanded}
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
    <span
      class="source-paper__stationary-control"
      data-source-paper-stationary-control
      aria-hidden="true"
      onclick={onToggle}
    ></span>
  {/if}
</div>

<style>
  /* The control may extend above the closed sheet; this root must remain unclipped. */
  .source-paper {
    position: relative;
    min-block-size: var(--tracker-peek-size);
    margin-block-start: calc(-1 * var(--tracker-peek-size));
    margin-inline-start: var(--tracker-source-inset);
    background: var(--paper-deep);
    border: var(--tracker-paper-border-width) solid var(--tracker-paper-line);
    border-end-start-radius: var(--tracker-source-end-start-radius);
    border-end-end-radius: var(--tracker-source-end-end-radius);
    overflow: visible;
  }

  .source-paper__surface {
    position: absolute;
    z-index: 0;
    inset: 0;
    background: transparent;
    border-radius: inherit;
    pointer-events: none;
    transition: background-color 180ms ease;
  }

  .source-paper__panel {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 260ms ease;
  }

  .source-paper__panel--open {
    grid-template-rows: 1fr;
  }

  .source-paper__clip {
    min-block-size: 0;
    overflow: hidden;
  }

  .source-paper__content {
    padding: calc(var(--tracker-peek-size) + 7px) calc(var(--tracker-target-size) + 8px) 8px 11px;
  }

  .source-paper__control {
    position: absolute;
    z-index: 3;
    inset-inline-end: 0;
    inset-block-end: 0;
    display: flex;
    inline-size: var(--tracker-target-size);
    block-size: var(--tracker-target-size);
    align-items: center;
    justify-content: center;
    color: var(--ink-muted);
    border-radius: var(--tracker-paper-radius);
  }

  .source-paper__chevron {
    position: absolute;
    inset-inline-end: 3px;
    inset-block-end: 3px;
    inline-size: 9px;
    block-size: 9px;
    transform: rotate(45deg);
    transition: transform 260ms ease;
  }

  .source-paper__chevron--open {
    transform: rotate(225deg);
  }

  .source-paper:has(
      .source-paper__control:is(:hover, :focus-visible),
      .source-paper__stationary-control:hover
    )
    .source-paper__surface {
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }

  .source-paper__stationary-control {
    position: absolute;
    z-index: 3;
    inset-inline-end: 0;
    inset-block-start: calc(
      var(--tracker-peek-size) - var(--tracker-target-size) -
        (2 * var(--tracker-paper-border-width))
    );
    inline-size: var(--tracker-target-size);
    block-size: var(--tracker-target-size);
    cursor: pointer;
  }

  .source-paper__control:focus-visible {
    outline: 1px solid currentColor;
    outline-offset: -3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .source-paper__surface,
    .source-paper__panel,
    .source-paper__chevron {
      transition: none;
    }
  }
</style>
