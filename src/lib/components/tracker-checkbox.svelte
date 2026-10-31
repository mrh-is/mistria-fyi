<script lang="ts">
  import { provenanceMark } from "#lib/engine/provenance-marks.js";
  import { factFieldOf } from "#lib/engine/provenance.js";

  import type { MarkLayer } from "#lib/engine/provenance-marks.js";
  import type { FactProvenance } from "#lib/engine/provenance.js";
  import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

  export type CheckboxState = "checked" | "obtained" | "unchecked";

  let {
    fact,
    label,
    onclick,
    provenance,
    state,
  }: {
    /** The fact's key: it seeds the mark, and a quest's X takes two moments. */
    fact: string;
    label: string;
    onclick: (event: MouseEvent) => void;
    /** Decorative: picks the tool that drew the mark, so it's never announced. */
    provenance: DeepReadonly<FactProvenance> | undefined;
    state: CheckboxState;
  } = $props();

  const rawInstanceId = $props.id();
  const instanceId = rawInstanceId.replaceAll(/[^a-zA-Z0-9_-]/g, "-");

  let isChecked = $derived(state === "checked");
  let isObtained = $derived(state === "obtained");
  let layers: MarkLayer[] = $derived(
    state === "unchecked"
      ? []
      : provenanceMark({
          fact,
          obtainedSource: provenance?.obtainedSource,
          // A fact with no record predates provenance, like an `unknown` one.
          source: provenance?.source ?? "unknown",
          state,
          twoMoments: factFieldOf(fact) === "questStates",
        }),
  );
</script>

<button
  class="tracker-checkbox"
  class:tracker-checkbox--checked={isChecked}
  class:tracker-checkbox--obtained={isObtained}
  type="button"
  aria-label={label}
  {onclick}
>
  <svg class="tracker-checkbox__icon" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect
      x="3.5"
      y="3.5"
      width="21"
      height="21"
      rx="1"
      stroke="var(--color-ink-hairline)"
      stroke-width="1.5"
    />
    {#each layers as layer, index (index)}
      {@const maskId = `${instanceId}-pressure-${String(index)}`}
      {#if layer.pressure}
        <defs>
          <linearGradient
            id="{maskId}-ramp"
            gradientUnits="userSpaceOnUse"
            x1={layer.pressure.x1}
            y1={layer.pressure.y1}
            x2={layer.pressure.x2}
            y2={layer.pressure.y2}
          >
            <stop offset="0" stop-color="#fff" />
            <stop
              offset="1"
              stop-color="rgb({layer.pressure.end} {layer.pressure.end} {layer.pressure.end})"
            />
          </linearGradient>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="28" height="28">
            <rect width="28" height="28" fill="url(#{maskId}-ramp)" />
          </mask>
        </defs>
      {/if}
      <g transform={layer.transform} mask={layer.pressure ? `url(#${maskId})` : undefined}>
        <g
          filter={layer.filter}
          opacity={layer.opacity}
          stroke-linecap={layer.roundCaps ? "round" : undefined}
        >
          {#each layer.elements as element, elementIndex (elementIndex)}
            {#if element.kind === "stroke"}
              <path
                class:tracker-checkbox__crossing-stroke={element.animated}
                d={element.d}
                opacity={element.opacity}
                pathLength={element.animated ? 1 : undefined}
                stroke="currentColor"
                stroke-width={element.width}
                stroke-dasharray={element.animated ? "1 2" : undefined}
                stroke-dashoffset={element.animated ? 1 : undefined}
              />
            {:else if element.kind === "dot"}
              <circle cx={element.cx} cy={element.cy} r={element.r} fill="currentColor" />
            {:else}
              <rect
                x="5.6"
                y="12.2"
                width="16.8"
                height="3.6"
                transform={element.transform}
                fill="currentColor"
              />
            {/if}
          {/each}
        </g>
      </g>
    {/each}
  </svg>
</button>

<style>
  .tracker-checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: var(--tracker-target-size, 44px);
    min-width: var(--tracker-target-size, 44px);
    flex-shrink: 0;
    color: var(--color-ink-muted);
    border-radius: var(--radius);
  }

  .tracker-checkbox:is(:active, :focus-visible) {
    background: color-mix(in srgb, currentColor 7%, transparent);
    outline: none;
  }

  @media (hover: hover) {
    .tracker-checkbox:hover {
      background: color-mix(in srgb, currentColor 7%, transparent);
      outline: none;
    }
  }

  .tracker-checkbox:focus-visible {
    outline: 1px solid currentColor;
    outline-offset: -3px;
    /* stylelint-disable-next-line declaration-property-unit-disallowed-list -- an inset focus ring, not an elevation */
    box-shadow: inset 0 0 0 1px currentColor;
  }

  .tracker-checkbox--checked {
    color: var(--color-tracker-checked);
  }

  .tracker-checkbox--obtained {
    color: var(--color-tracker-obtained);
  }

  .tracker-checkbox__icon {
    width: 24px;
    height: 24px;
    /* A hand-drawn stroke can overrun the box, and the viewBox's edge shouldn't cut it off. */
    overflow: visible;
  }

  .tracker-checkbox__crossing-stroke {
    animation: draw-tracker-mark 300ms 50ms ease-out forwards;
  }

  @keyframes draw-tracker-mark {
    to {
      stroke-dashoffset: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tracker-checkbox__crossing-stroke {
      animation: none;
      stroke-dashoffset: 0;
    }
  }
</style>
