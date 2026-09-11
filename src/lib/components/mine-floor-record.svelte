<script lang="ts">
  import { Minus, Plus } from "@lucide/svelte";

  import { page } from "$app/state";
  import { getFeedbackContextOrFallback } from "$lib/feedback/context.svelte.js";

  import type { MinesBiome } from "$lib/types/tracker-data.js";

  let {
    biomes,
    compact = false,
    floor,
    onChange,
    registerFeedback = true,
  }: {
    biomes: MinesBiome[];
    compact?: boolean;
    floor: number;
    onChange: (floor: number) => void;
    registerFeedback?: boolean;
  } = $props();

  let feedbackContext = getFeedbackContextOrFallback();
  let maxFloor = $derived(biomes.at(-1)?.floors.end ?? 0);
  let currentBiome = $derived(
    biomes.find((biome) => floor >= biome.floors.start && floor <= biome.floors.end) ?? biomes[0],
  );
  let markerPosition = $derived(
    maxFloor > 0 ? (Math.min(Math.max(floor, 0), maxFloor) / maxFloor) * 100 : 0,
  );
  let reportable = $derived(
    registerFeedback
      ? feedbackContext.reportable({
          category: "mines",
          displayName: "Floor progress",
          extra: { biome: currentBiome.name, floor },
          page: page.url.pathname,
        })
      : undefined,
  );

  function segmentWidth(biome: MinesBiome): number {
    if (maxFloor <= 0) return 0;
    return ((biome.floors.end - biome.floors.start + 1) / maxFloor) * 100;
  }

  function updateFloor(value: number): void {
    onChange(Math.min(Math.max(Math.round(value), 0), maxFloor));
  }

  function commitInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const value = Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(value)) {
      input.value = String(floor);
      return;
    }
    updateFloor(value);
  }
</script>

<div class="mine-floor-record" data-mine-floor-record data-compact={compact} {@attach reportable}>
  {#if compact}
    <span class="floor-label">Floor progress</span>
  {/if}

  {#if !compact}
    <div class="mine-survey" data-testid="mine-survey" aria-hidden="true">
      <span class="mine-biomes">
        {#each biomes as biome (biome.id)}
          <i data-mine-biome-segment={biome.id} style="width: {segmentWidth(biome)}%"></i>
        {/each}
      </span>
      <span class="mine-progress" style="width: {markerPosition}%"></span>
      <span class="mine-marker" data-testid="mine-marker" style="left: {markerPosition}%"></span>
    </div>
  {/if}

  <div class="floor-controls" role="group" aria-label="Mine floor, {floor} of {maxFloor}">
    <button
      type="button"
      disabled={floor <= 0}
      aria-label="Go up one floor"
      onclick={() => {
        updateFloor(floor - 1);
      }}
    >
      <Minus aria-hidden="true" />
    </button>

    <span class="floor-readout">
      <span>Floor</span>
      <input
        aria-label="Mine floor"
        type="number"
        inputmode="numeric"
        min="0"
        max={maxFloor}
        value={floor}
        onchange={commitInput}
      />
      <span aria-hidden="true">/ {maxFloor}</span>
    </span>

    <button
      type="button"
      disabled={floor >= maxFloor}
      aria-label="Go down one floor"
      onclick={() => {
        updateFloor(floor + 1);
      }}
    >
      <Plus aria-hidden="true" />
    </button>
  </div>

  {#if currentBiome}
    <span class="biome-readout" aria-live="polite">
      <strong>{currentBiome.name}</strong>
      <span>floors {currentBiome.floors.start}–{currentBiome.floors.end}</span>
    </span>
  {/if}
</div>

<style>
  .mine-floor-record {
    display: grid;
    min-width: 0;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--hairline);
    border-radius: 2px;
    background: var(--paper-raised);
    box-shadow: var(--shadow-small);
    color: var(--ink);
  }

  .floor-label {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 650;
  }

  .mine-survey {
    position: relative;
    height: 14px;
    margin-inline: 6px;
  }

  .mine-biomes,
  .mine-progress {
    position: absolute;
    top: 5px;
    right: 0;
    left: 0;
    display: flex;
    height: 4px;
    overflow: hidden;
    background: color-mix(in srgb, var(--cat-mines) 13%, transparent);
  }

  .mine-biomes i {
    height: 100%;
    border-right: 1px solid var(--paper-raised);
  }

  .mine-biomes i:last-child {
    border-right: 0;
  }

  .mine-progress {
    right: auto;
    background: var(--cat-mines);
    transition: width 300ms ease-out;
  }

  .mine-marker {
    position: absolute;
    top: 1px;
    width: 2px;
    height: 12px;
    background: var(--ink);
    box-shadow: 0 0 0 2px var(--paper-raised);
    transform: translateX(-1px);
    transition: left 300ms ease-out;
  }

  .floor-controls {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 6px;
  }

  .floor-controls > button {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 1px solid var(--hairline);
    border-radius: 2px;
    background: transparent;
    color: var(--ink-muted);
  }

  .floor-controls > button :global(svg) {
    width: 16px;
    height: 16px;
  }

  .floor-controls > button:is(:hover, :focus-visible):not(:disabled) {
    border-color: var(--cat-mines);
    color: var(--cat-mines);
    outline: 2px solid var(--cat-mines);
    outline-offset: -2px;
  }

  .floor-controls > button:disabled {
    opacity: 0.38;
  }

  .floor-readout {
    display: flex;
    min-width: 0;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
    font-family: var(--font-data);
    font-size: 12px;
    white-space: nowrap;
  }

  .floor-readout input {
    width: 5ch;
    min-height: 44px;
    appearance: textfield;
    border: 0;
    border-bottom: 1px solid var(--cat-mines);
    background: transparent;
    color: var(--ink);
    font-family: var(--font-data);
    font-size: 16px;
    text-align: center;
  }

  .floor-readout input::-webkit-inner-spin-button,
  .floor-readout input::-webkit-outer-spin-button {
    appearance: none;
  }

  .floor-readout input:focus-visible {
    outline: 2px solid var(--cat-mines);
    outline-offset: 2px;
  }

  .biome-readout {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 6px;
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: 11px;
  }

  .biome-readout strong {
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 13px;
  }

  .mine-floor-record[data-compact="true"] {
    grid-template-columns: minmax(0, 1fr) minmax(180px, 1fr);
    align-items: center;
    padding-block: 6px;
  }

  .mine-floor-record[data-compact="true"] .biome-readout {
    grid-column: 1 / -1;
  }

  @media (max-width: 430px) {
    .mine-floor-record[data-compact="true"] {
      grid-template-columns: 1fr;
    }

    .mine-floor-record[data-compact="true"] .biome-readout {
      grid-column: auto;
    }
  }

  @media (min-width: 701px) and (hover: hover) and (pointer: fine) {
    .floor-controls {
      grid-template-columns: 32px minmax(0, 1fr) 32px;
    }

    .floor-controls > button {
      width: 32px;
      height: 32px;
    }

    .floor-readout input {
      min-height: 32px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mine-progress,
    .mine-marker {
      transition-duration: 0.01ms;
    }
  }
</style>
