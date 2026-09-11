<script lang="ts">
  import { page } from "$app/state";
  import { Icon } from "$lib/components/icon/index.js";
  import Stepper from "$lib/components/stepper.svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import { trackerData } from "$lib/data/index.js";
  import { getRenownPresentation } from "$lib/engine/renown-presentation.js";
  import { getFeedbackContextOrFallback } from "$lib/feedback/context.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  let { compact = false }: { compact?: boolean } = $props();

  let feedbackContext = getFeedbackContextOrFallback();
  let level = $derived(userState.state.completed.renown);
  let presentation = $derived(getRenownPresentation(level, trackerData.townRanks));
  let reportable = $derived(
    feedbackContext.reportable({
      category: "renown",
      displayName: presentation.currentRank.name,
      extra: { level },
      page: page.url.pathname,
    }),
  );
  let editing = $state(false);
  let editValue = $state("");
  let editInputRef = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (editInputRef) {
      editInputRef.focus();
      editInputRef.select();
    }
  });

  function startEditing(): void {
    editValue = String(level);
    editing = true;
  }

  function commitEdit(): void {
    const value = Number(editValue);
    if (editValue.trim() !== "" && Number.isFinite(value) && Number.isInteger(value)) {
      setRenownWithCelebration(value);
    }
    editing = false;
  }

  function handleEditKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") commitEdit();
    if (event.key === "Escape") editing = false;
  }

  function setRenownWithCelebration(newLevel: number): void {
    const wasDone = level >= presentation.maxLevel;
    userState.setRenown(newLevel);
    if (!wasDone && userState.state.completed.renown >= presentation.maxLevel) celebrateCategory();
  }
</script>

<div
  class="renown-current"
  data-renown-current
  data-compact={compact}
  data-maxed={presentation.isMaxed}
  {@attach reportable}
>
  {#if presentation.currentRank}
    <span class="rank-seal" style="--rank-color: {presentation.color}" aria-hidden="true">
      <Icon.ProgressMark
        type="town_rank"
        fill={presentation.color}
        color={presentation.color}
        strokeWidth={1.5}
      />
    </span>

    <span class="rank-copy">
      <strong>{presentation.currentRank.name}</strong>
      {#if presentation.isMaxed}
        <small>Max rank reached</small>
      {:else}
        <small>{presentation.withinRank} / {presentation.rankSpan} in rank</small>
      {/if}
    </span>
  {/if}

  <span
    class="renown-rule"
    role="progressbar"
    aria-label="Renown progress"
    aria-valuemin="0"
    aria-valuemax={presentation.maxLevel}
    aria-valuenow={level}
  >
    <i style="width: {presentation.overallPercent}%"></i>
  </span>

  <Stepper
    decrementDisabled={level <= 0}
    incrementDisabled={level >= presentation.maxLevel}
    decrementLabel="Decrease renown"
    incrementLabel="Increase renown"
    label="Renown level"
    value="{level} of {presentation.maxLevel}"
    onDecrement={() => {
      setRenownWithCelebration(level - 1);
    }}
    onIncrement={() => {
      setRenownWithCelebration(level + 1);
    }}
  >
    {#if editing}
      <Input
        aria-label="Renown level"
        bind:ref={editInputRef}
        class="h-8 w-20 text-center font-mono text-xs"
        type="number"
        max={presentation.maxLevel}
        min={0}
        value={editValue}
        onblur={commitEdit}
        oninput={(event: Event) => {
          editValue = (event.target as HTMLInputElement).value;
        }}
        onkeydown={handleEditKeydown}
      />
    {:else}
      <button
        class="renown-count"
        aria-label="Edit renown level, currently {level} of {presentation.maxLevel}"
        type="button"
        onclick={startEditing}
      >
        {level} / {presentation.maxLevel}
      </button>
    {/if}
  </Stepper>
</div>

<style>
  .renown-current {
    display: grid;
    min-width: 0;
    grid-template-columns: 54px minmax(0, 1fr);
    align-items: center;
    gap: 5px 10px;
    padding: 12px;
    border: 1px solid var(--hairline);
    border-radius: 2px;
    background: var(--paper-raised);
    box-shadow: var(--shadow-small);
    color: var(--ink);
  }

  .rank-seal {
    display: grid;
    width: 48px;
    height: 48px;
    grid-row: span 2;
    place-items: center;
    border: 2px solid color-mix(in srgb, var(--rank-color) 70%, var(--ink));
    border-radius: 50%;
    background: color-mix(in srgb, var(--rank-color) 15%, var(--paper-raised));
    box-shadow: 1px 2px 0 color-mix(in srgb, var(--rank-color) 25%, transparent);
    transform: rotate(-2deg);
  }

  .rank-seal :global(svg) {
    width: 28px;
    height: 28px;
  }

  .rank-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .rank-copy strong {
    overflow: hidden;
    font-family: var(--font-display);
    font-size: 24px;
    font-style: italic;
    font-weight: 400;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rank-copy small {
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: 11px;
  }

  .renown-rule {
    position: relative;
    display: block;
    height: 4px;
    overflow: hidden;
    background: color-mix(in srgb, var(--cat-renown) 14%, transparent);
  }

  .renown-rule i {
    display: block;
    height: 100%;
    background: var(--cat-renown);
    transition: width 300ms ease-out;
  }

  .renown-current > :global([role="group"]) {
    grid-column: 1 / -1;
  }

  .renown-count {
    min-width: 88px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: 12px;
  }

  .renown-count:is(:hover, :focus-visible) {
    color: var(--cat-renown);
    outline: 2px solid var(--cat-renown);
    outline-offset: -2px;
  }

  .renown-current[data-maxed="true"] .rank-copy {
    color: var(--ink-muted);
  }

  .renown-current[data-compact="true"] {
    grid-template-columns: 40px minmax(0, 1fr);
    padding: 8px;
  }

  .renown-current[data-compact="true"] .rank-seal {
    width: 36px;
    height: 36px;
  }

  .renown-current[data-compact="true"] .rank-seal :global(svg) {
    width: 21px;
    height: 21px;
  }

  .renown-current[data-compact="true"] .rank-copy strong {
    font-size: 20px;
  }

  @media (prefers-reduced-motion: reduce) {
    .renown-rule i {
      transition-duration: 0.01ms;
    }
  }
</style>
