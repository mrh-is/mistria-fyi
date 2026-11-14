<script lang="ts" generics="Choice extends string">
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";

  import type { Snippet } from "svelte";

  let {
    choices,
    columns,
    content,
    duration = 0,
    hiddenChoice,
    label,
    labelFor,
    mode = "radio",
    onSelect,
    value,
  }: {
    choices: readonly Choice[];
    columns?: string;
    content: Snippet<[Choice]>;
    duration?: number;
    hiddenChoice?: Choice;
    label?: string;
    labelFor?: (choice: Choice) => string;
    mode?: "radio" | "theme";
    onSelect: (choice: Choice) => void;
    value: Choice;
  } = $props();

  const interactionClass =
    "focus-visible:panel-segment-outline enabled:hover:panel-segment-outline";

  // Native radio-group keyboard model: arrows move selection (wrapping), Home & End jump.
  function moveRadioFocus(event: KeyboardEvent & { currentTarget: HTMLElement }): void {
    const step: Record<string, number> = {
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -1,
    };
    const group = event.currentTarget.closest('[role="radiogroup"]');
    if (!group) return;
    const radios = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
    const current = radios.indexOf(event.currentTarget as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === /* @wc-ignore */ "Home") {
      next = 0;
    } else if (event.key === /* @wc-ignore */ "End") {
      next = radios.length - 1;
    } else if (event.key in step) {
      next = (current + (step[event.key] ?? 0) + radios.length) % radios.length;
    }
    if (current === -1 || next === undefined) return;
    event.preventDefault();
    radios[next]?.focus();
    radios[next]?.click();
  }
</script>

{#if mode === "theme"}
  <ToggleGroup.Root
    class="segmented-picker-theme"
    type="single"
    {value}
    onValueChange={(next) => {
      const choice = choices.find((option) => option === next);
      if (choice !== undefined) onSelect(choice);
    }}
  >
    {#each choices as choice (choice)}
      <ToggleGroup.Item
        class="segmented-picker-option hover:bg-transparent hover:text-inherit focus-visible:ring-0 {interactionClass}"
        value={choice}
      >
        {@render content(choice)}
      </ToggleGroup.Item>
    {/each}
  </ToggleGroup.Root>
{:else}
  <div
    class="strip"
    class:slotted={columns !== undefined}
    role="radiogroup"
    aria-label={label}
    style:grid-template-columns={columns}
    style:transition-duration="{duration}ms"
  >
    {#each choices as choice, index (choice)}
      {@const hidden = choice === hiddenChoice}
      {@const last = index === choices.length - 1 || choices[index + 1] === hiddenChoice}
      {#snippet segment()}
        <button
          type="button"
          role="radio"
          class="segment {interactionClass}"
          class:last
          aria-label={labelFor?.(choice)}
          aria-checked={choice === value}
          aria-hidden={hidden}
          disabled={hidden}
          tabindex={choice === value && !hidden ? 0 : -1}
          onkeydown={moveRadioFocus}
          onclick={() => onSelect(choice)}
        >
          {@render content(choice)}
        </button>
      {/snippet}
      {#if columns}
        <div class="slot">{@render segment()}</div>
      {:else}
        {@render segment()}
      {/if}
    {/each}
  </div>
{/if}

<style>
  .strip,
  :global(.segmented-picker-theme) {
    display: flex;
    min-width: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
  }

  .segment,
  :global(.segmented-picker-theme .segmented-picker-option) {
    display: flex;
    min-width: 0;
    min-height: 44px;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 3px;
    overflow: hidden;
    padding: 4px 5px;
    border-right: 1px solid color-mix(in srgb, var(--color-ink-hairline) 28%, transparent);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .segment {
    color: var(--color-ink-muted);
    background: var(--color-paper-sunken);
  }

  .segment[aria-checked="true"],
  :global(.segmented-picker-theme .segmented-picker-option[data-state="on"]) {
    background: color-mix(in srgb, var(--primary) 12%, var(--color-paper-raised));
  }

  .segment[aria-checked="true"] {
    color: var(--color-ink);
  }

  .segment.last,
  :global(.segmented-picker-theme .segmented-picker-option:last-child) {
    border-right: 0;
  }

  :global(.segmented-picker-theme) {
    gap: 0;
    border-color: color-mix(in srgb, var(--color-ink-hairline) 42%, transparent);
    border-radius: 0;
  }

  :global(.segmented-picker-theme .segmented-picker-option) {
    flex: 0 0 auto;
    padding-inline: 9px;
    border-color: color-mix(in srgb, var(--color-ink-hairline) 26%, transparent);
    border-radius: 0;
  }

  :global(.segmented-picker-theme .segmented-picker-option[data-state="on"]) {
    color: var(--primary);
  }

  .strip.slotted {
    display: grid;
    transition-property: grid-template-columns;
    transition-timing-function: ease-out;
  }

  .slot {
    min-width: 0;
    overflow: hidden;
  }

  .slot .segment {
    width: 100%;
    height: 100%;
  }

  @media (hover: hover) and (pointer: fine) {
    .segment {
      min-height: 34px;
    }
  }

  @media (max-width: 359px) {
    :global(.segmented-picker-theme) {
      width: 100%;
    }

    :global(.segmented-picker-theme .segmented-picker-option) {
      flex: 1;
    }
  }
</style>
