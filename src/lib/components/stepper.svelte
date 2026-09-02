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
  }

  const {
    children,
    decrementDisabled = false,
    decrementLabel = "Decrease",
    incrementDisabled = false,
    incrementLabel = "Increase",
    onDecrement,
    onIncrement,
  }: Props = $props();
</script>

<div class="flex w-full items-center gap-2">
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
      <Minus class="size-4" />
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
      <Plus class="size-4" />
    </span>
  </button>
</div>
