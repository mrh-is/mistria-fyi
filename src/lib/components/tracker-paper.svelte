<script lang="ts">
  import type { Snippet } from "svelte";

  let { children, hasCutout }: { children: Snippet; hasCutout: boolean } = $props();
</script>

<div class="tracker-paper" data-tracker-paper>
  <div
    class="tracker-paper__surface"
    data-testid="tracker-paper-surface"
    class:tracker-paper__surface--cutout={hasCutout}
  >
    {@render children()}
  </div>

  {#if hasCutout}
    <svg
      class="tracker-paper__diagonal"
      data-tracker-paper-diagonal
      viewBox="0 0 27 27"
      aria-hidden="true"
    >
      <path
        d="M 26.5 0.5 L 0.5 26.5"
        fill="none"
        stroke="var(--tracker-paper-line)"
        stroke-width="1"
        stroke-linecap="butt"
        vector-effect="non-scaling-stroke"
        shape-rendering="geometricPrecision"
      />
    </svg>
  {/if}
</div>

<style>
  .tracker-paper {
    position: relative;
    z-index: 2;
    filter: drop-shadow(var(--shadow-small));
  }

  .tracker-paper__surface {
    position: relative;
    z-index: 1;
    display: flex;
    min-block-size: var(--tracker-row-min-size);
    align-items: center;
    gap: var(--tracker-row-gap);
    padding: 4px 12px 4px 0;
    background: var(--paper-raised);
    border-color: var(--tracker-paper-line);
    border-style: solid;
    border-width: var(--tracker-paper-border-width);
    border-block-start-width: var(--tracker-paper-border-start-width);
    border-start-start-radius: var(--tracker-paper-start-start-radius);
    border-start-end-radius: var(--tracker-paper-start-end-radius);
    border-end-start-radius: var(--tracker-paper-end-start-radius);
    border-end-end-radius: var(--tracker-paper-end-end-radius);
  }

  .tracker-paper__surface--cutout {
    padding-inline-end: max(12px, calc(var(--tracker-target-size) + 4px));
    clip-path: polygon(
      0 0,
      100% 0,
      100% calc(100% - var(--tracker-peek-size)),
      calc(100% - var(--tracker-peek-size)) 100%,
      0 100%
    );
  }

  .tracker-paper__diagonal {
    position: absolute;
    z-index: 2;
    inset-inline-end: 0;
    inset-block-end: 0;
    inline-size: var(--tracker-peek-size);
    block-size: var(--tracker-peek-size);
    overflow: visible;
    pointer-events: none;
  }
</style>
