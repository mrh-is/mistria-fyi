<script lang="ts">
  export type CheckboxState = "checked" | "obtained" | "unchecked";

  let {
    label,
    onclick,
    state,
  }: {
    label: string;
    onclick: (event: MouseEvent) => void;
    state: CheckboxState;
  } = $props();

  let isChecked = $derived(state === "checked");
  let isObtained = $derived(state === "obtained");
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
    {#if isChecked || isObtained}
      <path d="M9.5 20L18.5 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
    {/if}
    {#if isChecked}
      <path
        class="tracker-checkbox__crossing-stroke"
        d="M18.5 20L9.5 8"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-dasharray="20"
        stroke-dashoffset="20"
      />
    {/if}
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

  .tracker-checkbox:is(:hover, :focus-visible) {
    background: color-mix(in srgb, currentColor 7%, transparent);
    outline: none;
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
