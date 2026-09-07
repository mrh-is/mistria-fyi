<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";

  import { page } from "$app/state";
  import CornerPeek from "$lib/components/corner-peek.svelte";
  import Spoiler from "$lib/components/spoiler.svelte";
  import SpriteSlot from "$lib/components/sprite-slot.svelte";
  import TrackerCheckbox from "$lib/components/tracker-checkbox.svelte";
  import { extractDisplayBadges } from "$lib/engine/availability-condition.js";
  import { getFeedbackContextOrFallback } from "$lib/feedback/context.svelte.js";
  import { buildSourceSegments } from "$lib/utils/source-segments.js";

  import type { SpriteSlotState } from "$lib/components/sprite-slot.svelte";
  import type { CheckboxState } from "$lib/components/tracker-checkbox.svelte";
  import type { DisplayBadges } from "$lib/engine/availability-condition.js";
  import type { FeedbackContext } from "$lib/feedback/context.svelte.js";
  import type { Source } from "$lib/types/acquisition";
  import type { SegmentLookups, SourceSegment } from "$lib/utils/source-segments.js";

  export type TrackerRowDisplay =
    | { dimmed?: boolean; mode: "visible" }
    | { leaving?: boolean; mode: "completed" }
    | { mode: "obtained" }
    | { mode: "spoilered" };

  let {
    display,
    feedbackContext = getFeedbackContextOrFallback(),
    lookups,
    name,
    onToggle,
    reportCategory,
    reportEntityId,
    reportExtra,
    sources = [],
    sprite,
    spriteClass = "text-primary",
    subtitle,
  }: {
    display: TrackerRowDisplay;
    feedbackContext?: FeedbackContext;
    lookups?: SegmentLookups;
    name: string;
    onToggle: () => void;
    reportCategory: string;
    reportEntityId: string;
    reportExtra?: Record<string, number | string>;
    sources?: Source[];
    sprite?: string;
    spriteClass?: string;
    subtitle?: string;
  } = $props();

  let hasSources = $derived(sources.length > 0);
  let sourceBadges: DisplayBadges[] = $derived(
    sources.map((s) => {
      const condition = "availability" in s ? s.availability : undefined;
      return condition ? extractDisplayBadges(condition) : {};
    }),
  );
  let sourceSegments: SourceSegment[][] = $derived(
    lookups ? sources.map((s) => buildSourceSegments(s, lookups)) : [],
  );

  let spoilerRevealed = $state(false);

  let isCompleted = $derived(display.mode === "completed");
  let isObtained = $derived(display.mode === "obtained");
  let isSpoilered = $derived(display.mode === "spoilered" && !spoilerRevealed);
  let isLeaving = $derived(display.mode === "completed" && (display.leaving ?? false));
  let isDimmed = $derived(display.mode === "visible" && (display.dimmed ?? false));
  let sourceContentId = $derived(
    `sources-${reportEntityId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`,
  );

  let reportable = $derived(
    isSpoilered
      ? { category: reportCategory, displayName: "Spoilered item", page: page.url.pathname }
      : {
          category: reportCategory,
          displayName: name,
          entityId: reportEntityId,
          extra: reportExtra,
          page: page.url.pathname,
        },
  );

  let checkboxState: CheckboxState = $derived(
    isCompleted ? "checked" : isObtained ? "obtained" : "unchecked",
  );
  let spriteState: SpriteSlotState = $derived(
    isSpoilered ? "spoilered" : isCompleted ? "complete" : "ready",
  );

  function completeOut(node: Element) {
    if (node.getAttribute("data-leaving") !== "true" || prefersReducedMotion.current) {
      return { duration: 0 };
    }
    return {
      css: (t: number) => `opacity: ${t}; pointer-events: none;`,
      delay: 800,
      duration: 200,
      tick: (t: number) => {
        if (t === 0) {
          (node as HTMLElement).style.height = "0";
          (node as HTMLElement).style.overflow = "hidden";
        }
      },
    };
  }

  function focusAdjacentRow(row: HTMLElement): void {
    const rows = [
      ...(row.parentElement?.querySelectorAll<HTMLElement>("[data-tracker-row]") ?? []),
    ];
    const index = rows.indexOf(row);
    let focusTarget: HTMLElement | null = null;
    if (index + 1 < rows.length) {
      focusTarget = rows[index + 1].querySelector<HTMLElement>("button");
    } else if (index > 0) {
      focusTarget = rows[index - 1].querySelector<HTMLElement>("button");
    }
    if (focusTarget) {
      focusTarget.focus();
      return;
    }

    row
      .closest<HTMLElement>("[data-tracker-section]")
      ?.querySelector<HTMLElement>("button")
      ?.focus();
  }

  function handleToggle(event: MouseEvent): void {
    const shouldFocusAdjacentRow = display.mode === "visible";
    onToggle();
    if (!shouldFocusAdjacentRow) return;

    const row = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-tracker-row]");
    if (!row) return;
    requestAnimationFrame(() => {
      if (
        row.isConnected &&
        row.dataset.leaving === "true" &&
        row.contains(document.activeElement)
      ) {
        focusAdjacentRow(row);
      }
    });
  }
</script>

<div
  data-tracker-row
  out:completeOut
  data-leaving={isLeaving}
  {@attach feedbackContext.reportable(reportable)}
  class="tracker-row"
  class:tracker-row--has-sources={hasSources}
>
  <!-- Paper area: row content + grab triangle share a positioning context -->
  <div class="tracker-row__paper-area">
    <div
      class="tracker-row__paper"
      class:tracker-row__paper--dimmed={isDimmed}
      class:tracker-row__paper--completed={isCompleted || isLeaving}
    >
      <TrackerCheckbox
        state={checkboxState}
        label={isCompleted
          ? `Uncheck ${name}`
          : isSpoilered
            ? "Check spoilered item"
            : `Check ${name}`}
        onclick={handleToggle}
      />

      {#if sprite}
        <SpriteSlot {sprite} state={spriteState} class={spriteClass} />
      {/if}

      <span class="tracker-row__label">
        {#if isSpoilered}
          <Spoiler onReveal={() => (spoilerRevealed = true)}>
            {name}
            {#if subtitle}
              <span class="tracker-row__subtitle">{subtitle}</span>
            {/if}
          </Spoiler>
        {:else}
          {name}
          {#if subtitle}
            <span class="tracker-row__subtitle">{subtitle}</span>
          {/if}
        {/if}
      </span>

      {#if isObtained}
        <span class="tracker-row__active-badge">Active</span>
      {/if}
    </div>

    {#if hasSources}
      <CornerPeek
        contentId={sourceContentId}
        label="{isSpoilered ? 'Spoilered item' : name} sources"
        {sources}
        {sourceSegments}
        {sourceBadges}
      />
    {/if}
  </div>
</div>

<style>
  .tracker-row {
    position: relative;
  }

  .tracker-row__paper-area {
    position: relative;
  }

  .tracker-row__paper {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 8px;
    background: var(--paper);
    border: 1px solid var(--hairline);
    border-radius: 2px;
    transition: opacity 200ms;
  }

  .tracker-row--has-sources .tracker-row__paper {
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 26px), calc(100% - 26px) 100%, 0 100%);
  }

  .tracker-row__paper--dimmed {
    color: var(--ink-muted);
  }

  .tracker-row__paper--completed {
    color: var(--ink-muted);
    text-decoration: line-through;
  }

  .tracker-row__label {
    min-width: 0;
    flex: 1;
    font-size: 1rem;
    line-height: 1.5;
  }

  .tracker-row__subtitle {
    font-size: 0.875rem;
    color: var(--ink-muted);
  }

  .tracker-row__active-badge {
    font-size: 0.875rem;
    color: var(--fg-amber);
  }

  @media (prefers-reduced-motion: reduce) {
    .tracker-row__paper {
      transition: none;
    }
  }
</style>
