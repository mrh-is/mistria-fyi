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
  <svg class="tracker-checkbox__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect
      x="1.5"
      y="1.5"
      width="13"
      height="13"
      rx="1.5"
      stroke="currentColor"
      stroke-width="1.25"
    />
    {#if isChecked || isObtained}
      <path
        d="M4.5 8.5L7 11L11.5 5.5"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    {/if}
  </svg>
</button>

<style>
  .tracker-checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    min-width: 44px;
    flex-shrink: 0;
    color: var(--ink-muted);
  }

  .tracker-checkbox--checked {
    color: var(--fg-green);
  }

  .tracker-checkbox--obtained {
    color: var(--fg-amber);
  }

  .tracker-checkbox__icon {
    width: 18px;
    height: 18px;
  }
</style>
