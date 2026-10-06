<script lang="ts">
  import IconMinus from "@tabler/icons-svelte-runes/icons/minus";
  import IconPlus from "@tabler/icons-svelte-runes/icons/plus";

  import * as m from "#lib/paraglide/messages.js";

  import type { Snippet } from "svelte";

  interface Props {
    children?: Snippet;
    decrementDisabled?: boolean;
    decrementLabel: string;
    incrementDisabled?: boolean;
    incrementLabel: string;
    label?: string;
    onDecrement: () => void;
    onIncrement: () => void;
    value?: string;
  }

  let {
    children,
    decrementDisabled = false,
    decrementLabel,
    incrementDisabled = false,
    incrementLabel,
    label,
    onDecrement,
    onIncrement,
    value,
  }: Props = $props();
</script>

<div
  class="flex w-full items-center gap-2"
  role={label ? "group" : undefined}
  aria-label={label && value ? m.stepper_group_label({ label, value }) : label}
>
  <button
    class="group flex size-11 shrink-0 touch-manipulation items-center justify-center disabled:opacity-50"
    type="button"
    disabled={decrementDisabled}
    aria-label={decrementLabel}
    onclick={onDecrement}
  >
    <span
      class="flex size-9 items-center justify-center rounded-md border border-border transition-colors group-hover:bg-accent group-hover:text-foreground"
    >
      <IconMinus class="size-4" />
    </span>
  </button>

  {#if children}
    <div class="flex flex-1 items-center justify-center gap-2">
      {@render children()}
    </div>
  {/if}

  <button
    class="group flex size-11 shrink-0 touch-manipulation items-center justify-center disabled:opacity-50"
    type="button"
    disabled={incrementDisabled}
    aria-label={incrementLabel}
    onclick={onIncrement}
  >
    <span
      class="flex size-9 items-center justify-center rounded-md border border-border transition-colors group-hover:bg-accent group-hover:text-foreground"
    >
      <IconPlus class="size-4" />
    </span>
  </button>
</div>
