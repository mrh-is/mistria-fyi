<script lang="ts">
  import { meterInput } from "#lib/attachments/meter-input.js";
  import { celebrateProgress } from "#lib/controllers/celebration.js";
  import { captureUndoFocus, showMeterUndo } from "#lib/effects/undo-toast.js";
  import { MAX_HEART_LEVEL } from "#lib/engine/progress.js";
  import { factKey } from "#lib/engine/provenance.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { formatNumber } from "#lib/utils/format.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { VillagerId } from "#lib/types/tracker-data.js";

  let {
    dateable,
    id,
    locale,
    name,
  }: { dateable: boolean; id: VillagerId; locale: LocaleCode; name: string } = $props();

  const instance = $props.id();
  const heart =
    /* @wc-ignore */ "M12 20s-8-5-8-10.4A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 8 2.1C20 15 12 20 12 20z";
  const gem = /* @wc-ignore */ "M8.9 4.5h6.2l4.4 4.4v6.2l-4.4 4.4H8.9l-4.4-4.4V8.9z";
  let shape = $derived(dateable ? heart : gem);
  let level = $derived(userState.state.progress.heartLevels[id] ?? 0);
  let current = $derived(formatNumber(level, locale));
  let maximum = $derived(formatNumber(MAX_HEART_LEVEL, locale));

  // Curved strokes follow the prototype's pencil hatch, with repeatable spacing and slant.
  function hatch(seed: number): string {
    let value = seed;
    function random(): number {
      value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
      return value / 2 ** 32;
    }
    const angle = ((-38 + random() * 22) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return Array.from({ length: 8 }, (_, index) => {
      const offset = -9 + (index * 18) / 7 + (random() - 0.5) * 1.6;
      const length = 13 + random() * 4;
      const x = 12 - offset * sin;
      const y = 13 + offset * cos;
      return `M${(x - cos * length).toFixed(1)} ${(y - sin * length).toFixed(1)} Q${(x + random() - 0.5).toFixed(1)} ${(y + random() - 0.5).toFixed(1)} ${(x + cos * length).toFixed(1)} ${(y + sin * length).toFixed(1)}`;
    }).join(" ");
  }

  let marks = $derived.by(() => {
    let seed = 2_166_136_261;
    for (const character of id) {
      seed = Math.imul(seed ^ (character.codePointAt(0) ?? 0), 16_777_619);
    }
    return Array.from({ length: MAX_HEART_LEVEL }, (_, index) => ({
      clip: `${instance}-mark-${index}`,
      hatch: hatch(Math.imul(seed + index, 97) + 13),
      value: index + 1,
    }));
  });

  function setLevel(next: number): void {
    const focus = captureUndoFocus();
    const villager = id;
    const displayName = name;
    const language = locale;
    const fact = factKey("heartLevels", villager);
    celebrateProgress("villagers", () => {
      userState.setHeartLevel(villager, next, (before, after) => {
        const provenance = userState.provenanceOf(fact);
        showMeterUndo(
          {
            after,
            before,
            formatMessage(first, last) {
              const from = formatNumber(first, language);
              const to = formatNumber(last, language);
              return `${displayName}: ${from} → ${to} hearts`;
            },
            id: fact,
            locale: language,
            name: displayName,
            undo(value) {
              if (
                userState.state.progress.heartLevels[villager] === after &&
                userState.provenanceOf(fact) === provenance
              ) {
                userState.setHeartLevel(villager, value);
              }
            },
          },
          focus,
        );
      });
    });
  }

  const input = meterInput({
    discreteMarks: true,
    getValue: () => level,
    max: MAX_HEART_LEVEL,
    min: 0,
    onCommit: setLevel,
  });
</script>

<div
  class="marks"
  role="slider"
  tabindex="0"
  aria-label={`${name} heart level`}
  aria-valuemin={0}
  aria-valuemax={MAX_HEART_LEVEL}
  aria-valuenow={level}
  aria-valuetext={dateable
    ? `${name}, dateable, ${current} of ${maximum} hearts`
    : `${name}, friendship, ${current} of ${maximum} hearts`}
  {@attach input}
>
  {#each marks as mark (mark.value)}
    <span
      class="mark"
      data-villager-mark={mark.value}
      data-reached={mark.value <= level}
      style:--level-color={`var(--color-heart-level-${mark.value})`}
      style:--hatch-delay={`${(mark.value - 1) * 40}ms`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <defs>
          <clipPath id={mark.clip}><path d={shape} /></clipPath>
        </defs>
        <g clip-path={`url(#${mark.clip})`}>
          <path class="hatch" d={mark.hatch} stroke-width="1.9" stroke-linecap="round" />
        </g>
        <path class="printed-mark" d={shape} stroke-width="1.2" />
      </svg>
    </span>
  {/each}
</div>

<style>
  .marks {
    display: grid;
    inline-size: 100%;
    max-inline-size: 17.5rem;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    direction: ltr;
    touch-action: pan-y;
    user-select: none;
  }

  .mark {
    display: grid;
    min-block-size: 24px;
    place-items: center;
    cursor: pointer;
  }

  .mark svg {
    max-inline-size: 100%;
    pointer-events: none;
  }

  .printed-mark {
    stroke: var(--color-ink-hairline);
  }

  .mark:hover .printed-mark {
    stroke: var(--color-ink);
  }

  .hatch {
    clip-path: inset(0 100% 0 0);
    filter: url("#pencil-sm");
    stroke: var(--level-color);
  }

  .mark[data-reached="true"] .hatch {
    clip-path: inset(0);
    transition: clip-path 125ms ease-out var(--hatch-delay);
  }

  @media (pointer: coarse) {
    .mark {
      min-block-size: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mark[data-reached="true"] .hatch {
      transition: none;
    }
  }
</style>
