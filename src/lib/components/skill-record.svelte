<script lang="ts">
  import { meterInput } from "#lib/attachments/meter-input.js";
  import SkillPerks from "#lib/components/skill-perks.svelte";
  import { celebrateProgress } from "#lib/controllers/celebration.js";
  import { trackerData } from "#lib/data/index.js";
  import { captureUndoFocus, showMeterUndo } from "#lib/effects/undo-toast.js";
  import { MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import plural from "#lib/i18n/catalogs/plural.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { recordKeys } from "#lib/utils/record.js";
  import { page } from "$app/state";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { SkillId } from "#lib/types/tracker-data.js";

  let {
    anchor,
    compact = false,
    id,
    locale,
    name,
  }: {
    anchor?: string;
    compact?: boolean;
    id: SkillId;
    locale: LocaleCode;
    name: string;
  } = $props();

  const minorStep = 5;
  const majorStep = 15;
  const ticks = Array.from({ length: MAX_SKILL_LEVEL / minorStep + 1 }, (_, i) => i * minorStep);
  const feedbackContext = getFeedbackContext();
  let level = $derived(userState.state.progress.skillLevels[id] ?? 0);
  let preview = $state<number>();
  let shownLevel = $derived(preview ?? level);
  let tiers = $derived(
    trackerData.skills[id].perkTiers.map((tier, index) => ({
      ids: recordKeys(tier),
      level: trackerData.perkTierLevels[index],
      number: index + 1,
    })),
  );
  let total = $derived(tiers.reduce((count, tier) => count + tier.ids.length, 0));
  let reached = $derived(
    tiers.reduce((count, tier) => count + (level >= tier.level ? tier.ids.length : 0), 0),
  );
  let formattedReached = $derived(formatNumber(reached, locale));
  let formattedTotal = $derived(formatNumber(total, locale));
  let formattedLevel = $derived(formatNumber(shownLevel, locale));
  let formattedMax = $derived(formatNumber(MAX_SKILL_LEVEL, locale));

  let reportable = $derived(
    feedbackContext.reportableAttachment({
      category: "skill",
      displayName: name,
      entityId: id,
      extra: { level },
      page: page.url.pathname,
    }),
  );

  function setLevel(next: number): void {
    const focus = captureUndoFocus();
    const skill = id;
    const displayName = name;
    const language = locale;
    const fact = factKey("skillLevels", skill);
    celebrateProgress("skills", () => {
      userState.setSkillLevel(skill, next, (before, after) => {
        const provenance = userState.provenanceOf(fact);
        showMeterUndo(
          {
            after,
            before,
            id: fact,
            locale: language,
            name: displayName,
            undo(value) {
              if (
                userState.state.progress.skillLevels[skill] === after &&
                userState.provenanceOf(fact) === provenance
              ) {
                userState.setSkillLevel(skill, value);
              }
            },
          },
          focus,
        );
      });
    });
  }

  const input = meterInput({
    getValue: () => level,
    majorStep,
    max: MAX_SKILL_LEVEL,
    min: 0,
    onCommit: setLevel,
    onPreview: (value) => {
      preview = value;
    },
  });
</script>

<li class="skill-record" {@attach reportable}>
  <div class="head">
    <h2 id={anchor} data-ledger-index-heading={anchor ? "" : undefined} tabindex="-1">{name}</h2>
    <div class="controls">
      <button
        type="button"
        disabled={level === 0}
        aria-label={`Decrease ${name} level`}
        onclick={() => setLevel(level - 1)}>−</button
      >
      <span class="font-hand">{formattedLevel}</span>
      <button
        type="button"
        disabled={level === MAX_SKILL_LEVEL}
        aria-label={`Increase ${name} level`}
        onclick={() => setLevel(level + 1)}>+</button
      >
      <span>/ {formattedMax}</span>
    </div>
    <span class="count"
      >{plural(total, [
        `${formattedReached} / ${formattedTotal} perk`,
        `${formattedReached} / ${formattedTotal} perks`,
      ])}</span
    >
  </div>

  <div class="ruler-and-tiers" class:compact>
    <div
      class="ruler"
      class:scrubbing={preview !== undefined}
      role="slider"
      tabindex="0"
      aria-label={`${name} level`}
      aria-valuemin={0}
      aria-valuemax={MAX_SKILL_LEVEL}
      aria-valuenow={shownLevel}
      aria-valuetext={`${name}, level ${formattedLevel} of ${formattedMax}`}
      {@attach input}
    >
      <span class="rule" aria-hidden="true"></span>
      {#each ticks as value (value)}
        {@const major = value % majorStep === 0}
        <span
          class="tick"
          class:major
          class:zero={value === 0}
          style:inset-inline-start={`${(value / MAX_SKILL_LEVEL) * 100}%`}
          aria-hidden="true"
        >
          {#if major}<span>{formatNumber(value, locale)}</span>{/if}
        </span>
      {/each}
      <span
        class="fill"
        style:inline-size={`${(shownLevel / MAX_SKILL_LEVEL) * 100}%`}
        aria-hidden="true"
      ></span>
    </div>
    <SkillPerks {id} {locale} {level} {tiers} />
  </div>
</li>

<style>
  .skill-record {
    min-inline-size: 0;
    padding-block: 1rem;
  }

  .skill-record:not(:first-child) {
    border-block-start: 1px solid var(--color-rule);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
  }

  h2 {
    font-family: var(--font-body);
    font-size: var(--text-xl);
    font-weight: 650;
    overflow-wrap: anywhere;
    scroll-margin-block-start: 7rem;
  }

  .controls,
  .count {
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .controls {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.4rem;
    white-space: nowrap;
  }

  .controls .font-hand {
    min-inline-size: 2ch;
    color: var(--color-meter-mark);
    font-size: var(--text-lg);
    text-align: center;
  }

  .controls button {
    min-inline-size: 2rem;
    min-block-size: 2rem;
    border: 1px solid var(--color-rule);
    background: var(--color-paper-raised);
    font-size: var(--text-base);
    touch-action: manipulation;
  }

  .controls button:disabled {
    opacity: 0.55;
  }

  @media (hover: hover) {
    .controls button:enabled:hover {
      border-color: var(--color-category-skills);
      color: var(--color-category-skills-text);
    }
  }

  .count {
    margin-inline-start: auto;
  }

  .ruler-and-tiers {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    margin-block-start: 0.65rem;
  }

  .ruler {
    position: relative;
    isolation: isolate;
    grid-column: 1 / 5;
    min-block-size: 2.5rem;
    cursor: ew-resize;
    touch-action: pan-y;
    user-select: none;
  }

  .rule,
  .tick,
  .fill {
    position: absolute;
    inset-block-start: 65%;
    pointer-events: none;
  }

  .rule {
    inset-inline: 0 -0.6rem;
    block-size: var(--size-meter-rule);
    background: var(--color-meter-rule);
    translate: 0 -50%;
  }

  .rule::after {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-end: 0;
    inline-size: 0.4rem;
    block-size: 0.4rem;
    border-block-start: var(--size-meter-rule) solid var(--color-meter-rule);
    border-inline-end: var(--size-meter-rule) solid var(--color-meter-rule);
    content: "";
    transform: translateY(-50%) rotate(45deg);
  }

  .tick {
    inline-size: 1px;
    block-size: var(--size-meter-tick);
    background: var(--color-meter-tick);
    translate: -50% -50%;
  }

  .tick.major {
    block-size: var(--size-meter-tick-major);
  }

  .tick.zero {
    inline-size: var(--size-meter-mark);
    background: var(--color-meter-rule);
  }

  .tick span {
    position: absolute;
    inset-block-end: 100%;
    inset-inline-start: 50%;
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-3xs);
    line-height: 1;
    translate: -50%;
  }

  .fill {
    inset-inline-start: 0;
    block-size: var(--size-meter-mark);
    background: var(--color-category-skills);
    filter: url("#pencil-sm");
    transition: inline-size 160ms ease-out;
    translate: 0 -50%;
  }

  .scrubbing .fill {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }

  @media (pointer: coarse) {
    .controls button,
    .ruler {
      min-block-size: 44px;
    }

    .controls button {
      min-inline-size: 44px;
    }
  }

  .ruler-and-tiers.compact {
    grid-template-columns: minmax(0, 1fr);
  }

  .compact .ruler {
    grid-column: 1;
    margin-inline: 0.4rem 0.8rem;
  }

  @media (max-width: 43.75rem) {
    .head {
      justify-content: space-between;
    }

    h2 {
      flex: 1;
      min-inline-size: 0;
    }

    .count {
      flex-basis: 100%;
      margin-inline-start: 0;
    }

    .ruler-and-tiers {
      grid-template-columns: minmax(0, 1fr);
    }

    .ruler {
      grid-column: 1;
      margin-inline: 0.4rem 0.8rem;
    }
  }
</style>
