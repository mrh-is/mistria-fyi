<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import Stepper from "#lib/components/stepper.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { celebrateCategory } from "#lib/effects/celebrate.js";
  import { isCategoryComplete } from "#lib/engine/progress.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { getRenownPresentation } from "#lib/presentation/renown-presentation.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { page } from "$app/state";

  import type { LocaleCode } from "#lib/types/locale.js";

  let { compact = false, locale }: { compact?: boolean; locale: LocaleCode } = $props();

  const feedbackContext = getFeedbackContext();
  let level = $derived(userState.state.completed.renown);
  let presentation = $derived(getRenownPresentation(level, trackerData.townRanks));
  let reportable = $derived(
    feedbackContext.reportable({
      category: "renown",
      displayName: getName("town-ranks", presentation.currentRankIndex.toString(), locale),
      extra: { level },
      page: page.url.pathname,
    }),
  );
  function commitInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const value = Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(value) || !Number.isInteger(value)) {
      input.value = String(level);
      return;
    }
    setRenownWithCelebration(value);
  }

  function setRenownWithCelebration(newLevel: number): void {
    const wasDone = isCategoryComplete("renown", userState.state);
    userState.setRenown(newLevel);
    if (!wasDone && isCategoryComplete("renown", userState.state)) celebrateCategory();
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
        stroke={1.5}
      />
    </span>

    <span class="rank-copy">
      <strong>{getName("town-ranks", presentation.currentRankIndex.toString(), locale)}</strong>
      {#if presentation.isMaxed}
        <small>{m.renown_max_rank_reached()}</small>
      {:else}
        <small>
          {m.renown_within_rank({ span: presentation.rankSpan, within: presentation.withinRank })}
        </small>
      {/if}
    </span>
  {/if}

  <span
    class="renown-rule"
    role="progressbar"
    aria-label={m.renown_progress_aria()}
    aria-valuemin="0"
    aria-valuemax={presentation.maxLevel}
    aria-valuenow={level}
  >
    <i style="width: {presentation.overallPercent}%"></i>
  </span>

  <Stepper
    decrementDisabled={level <= 0}
    incrementDisabled={level >= presentation.maxLevel}
    decrementLabel={m.renown_decrease()}
    incrementLabel={m.renown_increase()}
    label={m.renown_level_label()}
    value={m.stepper_level_progress({ level, max: presentation.maxLevel })}
    onDecrement={() => {
      setRenownWithCelebration(level - 1);
    }}
    onIncrement={() => {
      setRenownWithCelebration(level + 1);
    }}
  >
    <span class="renown-readout">
      <input
        aria-label={m.renown_level_label()}
        type="number"
        inputmode="numeric"
        max={presentation.maxLevel}
        min={0}
        value={level}
        onchange={commitInput}
      />
      <span aria-hidden="true">/ {presentation.maxLevel}</span>
    </span>
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
    border-radius: var(--radius);
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
    /* stylelint-disable-next-line declaration-property-unit-disallowed-list -- a hard offset "stamp" edge, not an elevation */
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
    font-size: var(--text-2xl);
    font-style: var(--font-display-style);
    font-weight: 400;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rank-copy small {
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
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

  .renown-readout {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .renown-readout input {
    width: 5ch;
    min-height: 44px;
    appearance: textfield;
    border: 0;
    border-bottom: 1px solid var(--cat-renown);
    background: transparent;
    color: var(--ink);
    font-family: var(--font-data);
    font-size: var(--text-base);
    text-align: center;
  }

  .renown-readout input::-webkit-inner-spin-button,
  .renown-readout input::-webkit-outer-spin-button {
    appearance: none;
  }

  .renown-readout input:focus-visible {
    outline: 2px solid var(--cat-renown);
    outline-offset: 2px;
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
    font-size: var(--text-xl);
  }

  @media (prefers-reduced-motion: reduce) {
    .renown-rule i {
      transition-duration: 0.01ms;
    }
  }
</style>
