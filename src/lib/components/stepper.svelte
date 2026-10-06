<script lang="ts">
  import IconMinus from "@tabler/icons-svelte-runes/icons/minus";
  import IconPlus from "@tabler/icons-svelte-runes/icons/plus";

  import * as m from "#lib/paraglide/messages.js";

  import type { Snippet } from "svelte";

  let {
    accentColor = "var(--color-ink)",
    children,
    decrementDisabled = false,
    decrementLabel,
    incrementDisabled = false,
    incrementLabel,
    label,
    onDecrement,
    onIncrement,
    value,
  }: {
    /** CSS color for the hover & focus border, usually the page's `--color-category-*` token. */
    accentColor?: string;
    children?: Snippet;
    decrementDisabled?: boolean;
    decrementLabel: string;
    incrementDisabled?: boolean;
    incrementLabel: string;
    label?: string;
    onDecrement: () => void;
    onIncrement: () => void;
    value?: string;
  } = $props();
</script>

<div
  class="stepper"
  style:--stepper-accent-color={accentColor}
  role={label ? "group" : undefined}
  aria-label={label && value ? m.stepper_group_label({ label, value }) : label}
>
  <button
    type="button"
    data-stepper-button
    disabled={decrementDisabled}
    aria-label={decrementLabel}
    onclick={onDecrement}
  >
    <IconMinus aria-hidden="true" />
  </button>

  <div class="stepper-readout">
    {@render children?.()}
  </div>

  <button
    type="button"
    data-stepper-button
    disabled={incrementDisabled}
    aria-label={incrementLabel}
    onclick={onIncrement}
  >
    <IconPlus aria-hidden="true" />
  </button>
</div>

<style>
  .stepper {
    display: grid;
    width: 100%;
    min-width: 0;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 6px;
  }

  .stepper > button {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 1px solid var(--color-ink-hairline);
    border-radius: var(--radius);
    background: transparent;
    color: var(--color-ink-muted);
    touch-action: manipulation;
  }

  .stepper > button :global(svg) {
    width: 16px;
    height: 16px;
  }

  .stepper > button:is(:hover, :focus-visible):not(:disabled) {
    border-color: var(--stepper-accent-color);
    color: var(--stepper-accent-color);
    outline: 2px solid var(--stepper-accent-color);
    outline-offset: -2px;
  }

  .stepper > button:disabled {
    opacity: 0.38;
  }

  .stepper-readout {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  @media (min-width: 701px) and (hover: hover) and (pointer: fine) {
    .stepper {
      grid-template-columns: 32px minmax(0, 1fr) 32px;
    }

    .stepper > button {
      width: 32px;
      height: 32px;
    }
  }
</style>
