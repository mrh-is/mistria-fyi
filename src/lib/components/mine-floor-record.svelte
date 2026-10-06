<script lang="ts">
  import Stepper from "#lib/components/stepper.svelte";
  import { getName } from "#lib/data/names.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { page } from "$app/state";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { MinesBiome } from "#lib/types/tracker-data.js";

  let {
    biomes,
    compact = false,
    floor,
    locale,
    onChange,
    registerFeedback = true,
  }: {
    biomes: MinesBiome[];
    compact?: boolean;
    floor: number;
    locale: LocaleCode;
    onChange: (floor: number) => void;
    registerFeedback?: boolean;
  } = $props();

  const feedbackContext = getFeedbackContext();
  let maxFloor = $derived(biomes.at(-1)?.floors.end ?? 0);
  let currentBiome = $derived(
    biomes.find((biome) => floor >= biome.floors.start && floor <= biome.floors.end) ?? biomes[0],
  );
  let reportable = $derived(
    registerFeedback
      ? feedbackContext.reportable({
          category: "mines",
          displayName: "Floor progress",
          extra: { biome: getName("mines", currentBiome.id, locale), floor },
          page: page.url.pathname,
        })
      : undefined,
  );

  function commitInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const value = Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(value)) {
      input.value = String(floor);
      return;
    }
    updateFloor(value);
  }

  function segmentProgress(biome: MinesBiome): number {
    const span = biome.floors.end - biome.floors.start + 1;
    if (span <= 0) return 0;
    const completed = Math.min(Math.max(floor - biome.floors.start + 1, 0), span);
    return (completed / span) * 100;
  }

  function segmentWidth(biome: MinesBiome): number {
    if (maxFloor <= 0) return 0;
    return ((biome.floors.end - biome.floors.start + 1) / maxFloor) * 100;
  }

  function updateFloor(value: number): void {
    onChange(Math.min(Math.max(Math.round(value), 0), maxFloor));
  }
</script>

<div class="mine-floor-record" data-mine-floor-record data-compact={compact} {@attach reportable}>
  {#if compact}
    <span class="floor-label">{m.mines_floor_progress_compact_label()}</span>
  {/if}

  {#if !compact}
    {#if currentBiome}
      <span class="biome-readout" aria-live="polite">
        <strong>{getName("mines", currentBiome.id, locale)}</strong>
        <span
          >{m.mines_floor_range({
            start: currentBiome.floors.start,
            end: currentBiome.floors.end,
          })}</span
        >
      </span>
    {/if}

    <div class="mine-survey" data-testid="mine-survey" aria-hidden="true">
      <span class="mine-biomes">
        {#each biomes as biome (biome.id)}
          <i data-mine-biome-segment={biome.id} style="width: {segmentWidth(biome)}%">
            <b data-mine-biome-progress style="width: {segmentProgress(biome)}%"></b>
          </i>
        {/each}
      </span>
    </div>
  {/if}

  <Stepper
    accent="var(--color-category-mines)"
    decrementDisabled={floor <= 0}
    decrementLabel={m.mines_floor_up()}
    incrementDisabled={floor >= maxFloor}
    incrementLabel={m.mines_floor_down()}
    label={m.mines_floor_group_aria({ floor, max: maxFloor })}
    onDecrement={() => {
      updateFloor(floor - 1);
    }}
    onIncrement={() => {
      updateFloor(floor + 1);
    }}
  >
    <span class="floor-readout">
      <span>{m.mines_floor_label()}</span>
      <input
        aria-label={m.mines_floor_input_aria()}
        type="number"
        inputmode="numeric"
        min="0"
        max={maxFloor}
        value={floor}
        onchange={commitInput}
      />
      <span aria-hidden="true">/ {maxFloor}</span>
    </span>
  </Stepper>

  {#if compact && currentBiome}
    <span class="biome-readout" aria-live="polite">
      <strong>{getName("mines", currentBiome.id, locale)}</strong>
      <span
        >{m.mines_floor_range({
          start: currentBiome.floors.start,
          end: currentBiome.floors.end,
        })}</span
      >
    </span>
  {/if}
</div>

<style>
  .mine-floor-record {
    display: grid;
    min-width: 0;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--color-ink-hairline);
    border-radius: var(--radius);
    background: var(--color-paper-raised);
    box-shadow: var(--shadow-small);
    color: var(--color-ink);
  }

  .floor-label {
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 650;
  }

  .mine-survey {
    position: relative;
    height: 14px;
    margin-inline: 6px;
  }

  .mine-biomes {
    position: absolute;
    top: 5px;
    right: 0;
    left: 0;
    display: flex;
    height: 4px;
    gap: 2px;
  }

  .mine-biomes i {
    display: block;
    height: 100%;
    overflow: hidden;
    background: color-mix(in srgb, var(--color-category-mines) 13%, transparent);
  }

  .mine-biomes b {
    display: block;
    height: 100%;
    background: var(--color-category-mines);
    transition: width 300ms ease-out;
  }

  .floor-readout {
    display: flex;
    min-width: 0;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
    font-family: var(--font-data);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .floor-readout input {
    width: 5ch;
    min-height: 44px;
    appearance: textfield;
    border: 0;
    border-bottom: 1px solid var(--color-category-mines);
    background: transparent;
    color: var(--color-ink);
    font-family: var(--font-data);
    font-size: var(--text-base);
    text-align: center;
  }

  .floor-readout input::-webkit-inner-spin-button,
  .floor-readout input::-webkit-outer-spin-button {
    appearance: none;
  }

  .floor-readout input:focus-visible {
    outline: 2px solid var(--color-category-mines);
    outline-offset: 2px;
  }

  .biome-readout {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 6px;
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  .biome-readout strong {
    color: var(--color-ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
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
    .floor-readout input {
      min-height: 32px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mine-biomes b {
      transition-duration: 0.01ms;
    }
  }
</style>
