<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="tracker-row-stack" data-tracker-row-stack>
  {@render children()}
</div>

<style>
  .tracker-row-stack {
    --tracker-paper-border-width: 1px;
    --tracker-paper-line: color-mix(in srgb, var(--hairline) 42%, transparent);
    --tracker-paper-radius: 2px;
    --tracker-peek-size: 27px;
    --tracker-row-gap: 7px;
    --tracker-sheet-gap: 6px;
    --tracker-target-size: 44px;
    --tracker-row-min-size: 48px;
    --tracker-sprite-size: 40px;
    --tracker-source-inset: calc(var(--tracker-target-size) + var(--tracker-row-gap));
  }

  .tracker-row-stack > :global([data-tracker-row]) {
    --tracker-paper-border-start-width: 0px;
    --tracker-paper-start-start-radius: 0px;
    --tracker-paper-start-end-radius: 0px;
    --tracker-paper-end-start-radius: 0px;
    --tracker-paper-end-end-radius: 0px;
    --tracker-source-end-start-radius: 0px;
    --tracker-source-end-end-radius: 0px;
    margin-block-end: 0;
    transition: margin-block-end 260ms ease;
  }

  .tracker-row-stack > :global([data-tracker-row]:first-child),
  .tracker-row-stack > :global([data-tracker-row][data-source-state="open"] + [data-tracker-row]) {
    --tracker-paper-border-start-width: var(--tracker-paper-border-width);
    --tracker-paper-start-start-radius: var(--tracker-paper-radius);
    --tracker-paper-start-end-radius: var(--tracker-paper-radius);
  }

  .tracker-row-stack > :global([data-tracker-row][data-source-state="open"]),
  .tracker-row-stack > :global([data-tracker-row]:last-child) {
    --tracker-paper-end-start-radius: var(--tracker-paper-radius);
  }

  .tracker-row-stack > :global([data-tracker-row][data-source-state="none"]:last-child) {
    --tracker-paper-end-end-radius: var(--tracker-paper-radius);
  }

  .tracker-row-stack > :global([data-tracker-row][data-source-state="closed"]:last-child) {
    --tracker-source-end-end-radius: var(--tracker-paper-radius);
  }

  .tracker-row-stack > :global([data-tracker-row][data-source-state="open"]) {
    --tracker-source-end-start-radius: var(--tracker-paper-radius);
    --tracker-source-end-end-radius: var(--tracker-paper-radius);
    margin-block-end: var(--tracker-sheet-gap);
  }

  @media (pointer: fine) and (hover: hover) {
    .tracker-row-stack {
      --tracker-target-size: 32px;
      --tracker-row-min-size: 40px;
      --tracker-sprite-size: 36px;
    }
  }

  @media (any-pointer: coarse), (hover: none) {
    .tracker-row-stack {
      --tracker-target-size: 44px;
      --tracker-row-min-size: 48px;
      --tracker-sprite-size: 40px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tracker-row-stack > :global([data-tracker-row]) {
      transition: none;
    }
  }
</style>
