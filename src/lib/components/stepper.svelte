<script lang="ts">
  import { Minus, Plus } from "@lucide/svelte";

  import type { Snippet } from "svelte";

  interface Props {
    children?: Snippet;
    decrementDisabled?: boolean;
    decrementLabel?: string;
    incrementDisabled?: boolean;
    incrementLabel?: string;
    onDecrement: () => void;
    onIncrement: () => void;
    size?: "default" | "sm";
  }

  const {
    children,
    decrementDisabled = false,
    decrementLabel = "Decrease",
    incrementDisabled = false,
    incrementLabel = "Increase",
    onDecrement,
    onIncrement,
    size = "default",
  }: Props = $props();
</script>

<div class="flex items-center {size === 'sm' ? 'gap-1' : 'w-full gap-2'}">
  <button
    class="group flex shrink-0 touch-manipulation items-center justify-center disabled:opacity-50 {size ===
    'sm'
      ? 'size-9'
      : '-mx-1.5 size-11'}"
    type="button"
    disabled={decrementDisabled}
    aria-label={decrementLabel}
    onclick={onDecrement}
  >
    <span
      class="flex items-center justify-center rounded-md border border-border transition-colors group-hover:bg-accent group-hover:text-foreground {size ===
      'sm'
        ? 'size-7'
        : 'size-8'}"
    >
      <Minus class="size-4" />
    </span>
  </button>

  {#if children}
    <div class="flex flex-1 items-center justify-center gap-2">
      {@render children()}
    </div>
  {/if}

  <button
    class="group flex shrink-0 touch-manipulation items-center justify-center disabled:opacity-50 {size ===
    'sm'
      ? 'size-9'
      : '-mx-1.5 size-11'}"
    type="button"
    disabled={incrementDisabled}
    aria-label={incrementLabel}
    onclick={onIncrement}
  >
    <span
      class="flex items-center justify-center rounded-md border border-border transition-colors group-hover:bg-accent group-hover:text-foreground {size ===
      'sm'
        ? 'size-7'
        : 'size-8'}"
    >
      <Plus class="size-4" />
    </span>
  </button>
</div>
