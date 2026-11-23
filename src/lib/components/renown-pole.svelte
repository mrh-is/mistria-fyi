<script lang="ts">
  import { meterInput } from "#lib/attachments/meter-input.js";
  import { celebrateProgress } from "#lib/controllers/celebration.js";
  import { trackerData } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { captureVerticalMeterUndo } from "#lib/effects/undo-toast.js";
  import { getMaxRenownLevel } from "#lib/engine/progress.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import { getRenownPresentation } from "#lib/presentation/renown-presentation.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { LocaleCode } from "#lib/types/locale.js";

  let { locale }: { locale: LocaleCode } = $props();
  const feedback = getFeedbackContext();
  const { townRanks } = trackerData.renown;
  const max = getMaxRenownLevel();
  let level = $derived(userState.state.progress.renown);
  let preview = $state<number>();
  let shown = $derived(preview ?? level);
  let printed = $derived(formatNumber(shown, locale));
  let total = $derived(formatNumber(max, locale));
  let rank = $derived(
    getName("town-ranks", String(getRenownPresentation(shown, townRanks).currentRankIndex), locale),
  );
  let reportable = $derived(
    feedback.reportableAttachment({
      category: "renown",
      displayName: rank,
      extra: { level },
      page: page.url.pathname,
    }),
  );

  function setLevel(next: number): void {
    const onApplied = captureVerticalMeterUndo("renown", getName("ui", "renown", locale), locale);
    celebrateProgress("renown", () => {
      userState.setRenown(next, onApplied);
    });
  }

  const input = meterInput({
    getValue: () => level,
    majorStep: 10,
    max,
    min: 0,
    onCommit: setLevel,
    onPreview: (value) => {
      preview = value;
    },
    orientation: "vertical",
  });
</script>

<div
  class="pole"
  class:scrubbing={preview !== undefined}
  role="slider"
  tabindex="0"
  aria-label="Renown level"
  aria-orientation="vertical"
  aria-valuemin={0}
  aria-valuemax={max}
  aria-valuenow={shown}
  aria-valuetext={`Renown level ${printed} of ${total}, ${rank}`}
  {@attach input}
  {@attach reportable}
>
  <span class="rule" aria-hidden="true"></span>
  {#each townRanks as tick, index (index)}
    {@const at = tick.levels.start}
    <span class="tick" style:inset-block-end={`${(100 * at) / max}%`} aria-hidden="true">
      <span class="rank-label" class:near={Math.abs(shown - at) < 4}>
        {getName("town-ranks", String(index), locale)}
      </span>
    </span>
  {/each}
  <span class="fill" style:block-size={`${(100 * shown) / max}%`} aria-hidden="true"></span>
  <span class="star" style:inset-block-end={`${(100 * shown) / max}%`} aria-hidden="true">
    <svg viewBox="0 0 26 26" aria-hidden="true">
      <path
        d="M13 2 17.05 7.42 23.46 9.6 19.56 15.13 19.47 21.9 13 19.9 6.53 21.9 6.44 15.13 2.54 9.6 8.95 7.42Z"
      />
    </svg>
    <span class="current"><span class="font-hand">{printed}</span> {rank}</span>
  </span>
</div>

<style>
  .pole {
    position: relative;
    min-inline-size: 44px;
    border-block-end: var(--size-meter-rule) solid var(--color-meter-rule);
    cursor: ns-resize;
    touch-action: pan-x;
  }

  .rule,
  .fill {
    position: absolute;
    inset-block-end: 0;
    inset-inline-start: 18px;
  }

  .rule {
    inset-block-start: 0;
    inline-size: var(--size-meter-rule);
    background: var(--color-meter-rule);
  }

  .fill {
    inline-size: 9px;
    background: var(--color-category-renown);
    filter: url(#pencil);
    transform: translateX(-40%);
    transition: block-size 160ms ease-out;
  }

  .tick,
  .star {
    position: absolute;
    inset-inline: 11px 0;
    display: flex;
    align-items: center;
    gap: 0.2rem;
    pointer-events: none;
  }

  .tick {
    block-size: 0;
    color: var(--color-ink-muted);
  }

  .tick::before {
    flex: 0 0 var(--size-meter-tick-major);
    border-block-start: 1px solid var(--color-meter-tick);
    content: "";
  }

  .rank-label,
  .current {
    font-family: var(--font-data);
    font-size: var(--text-xs);
    line-height: 1.05;
    overflow-wrap: anywhere;
  }

  .rank-label.near {
    visibility: hidden;
  }

  .star {
    inset-inline-start: 5px;
    color: var(--color-category-renown-text);
    transform: translateY(0.38rem);
    transition: inset-block-end 160ms ease-out;
  }

  .star svg {
    flex: 0 0 26px;
    inline-size: 26px;
    fill: var(--color-category-renown);
    filter: url(#pencil-sm);
    stroke: var(--color-ink);
    stroke-linejoin: round;
  }

  .current .font-hand {
    font-size: var(--text-base);
  }

  .scrubbing :is(.fill, .star) {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .fill,
    .star {
      transition: none;
    }
  }
</style>
