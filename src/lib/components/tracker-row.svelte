<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";

  import { page } from "$app/state";
  import SourcePaper from "$lib/components/source-paper.svelte";
  import Spoiler from "$lib/components/spoiler.svelte";
  import SpriteSlot from "$lib/components/sprite-slot.svelte";
  import TrackerCheckbox from "$lib/components/tracker-checkbox.svelte";
  import TrackerPaper from "$lib/components/tracker-paper.svelte";
  import { extractDisplayBadges } from "$lib/engine/availability-condition.js";
  import { getFeedbackContextOrFallback } from "$lib/feedback/context.svelte.js";
  import * as m from "$lib/paraglide/messages.js";
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

  const rawInstanceId = $props.id();
  const instanceId = rawInstanceId.replace(/[^a-zA-Z0-9_-]/g, "-");

  let expanded = $state(false);
  let spoilerRevealed = $state(false);
  let hasSources = $derived(sources.length > 0);
  let sourceBadges: DisplayBadges[] = $derived(
    sources.map((source) => {
      const condition = "availability" in source ? source.availability : undefined;
      return condition ? extractDisplayBadges(condition) : {};
    }),
  );
  let sourceSegments: SourceSegment[][] = $derived(
    lookups ? sources.map((source) => buildSourceSegments(source, lookups)) : [],
  );

  let isCompleted = $derived(display.mode === "completed");
  let isObtained = $derived(display.mode === "obtained");
  let isSpoilered = $derived(display.mode === "spoilered" && !spoilerRevealed);
  let isLeaving = $derived(display.mode === "completed" && (display.leaving ?? false));
  let isDimmed = $derived(display.mode === "visible" && (display.dimmed ?? false));
  let sourceContentId = $derived(
    `sources-${reportEntityId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${instanceId}`,
  );
  let sourceState = $derived(hasSources ? (expanded ? "open" : "closed") : "none");

  let reportable = $derived(
    isSpoilered
      ? {
          category: reportCategory,
          displayName: m.tracker_row_spoilered_item(),
          page: page.url.pathname,
        }
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
    const list = row.closest<HTMLElement>("[data-tracker-list], [data-tracker-section]");
    const searchRoot = list ?? row.parentElement;
    const rows = [...(searchRoot?.querySelectorAll<HTMLElement>("[data-tracker-row]") ?? [])];
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
  data-source-state={sourceState}
  out:completeOut
  data-leaving={isLeaving}
  {@attach feedbackContext.reportable(reportable)}
  class="tracker-row"
  class:tracker-row--dimmed={isDimmed}
  class:tracker-row--completed={isCompleted || isLeaving}
>
  <TrackerPaper hasCutout={hasSources}>
    <TrackerCheckbox
      state={checkboxState}
      label={isCompleted
        ? m.tracker_row_uncheck({ name })
        : isSpoilered
          ? m.tracker_row_check_spoilered()
          : m.tracker_row_check({ name })}
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
      <span class="tracker-row__active-badge">{m.tracker_row_active_badge()}</span>
    {/if}
  </TrackerPaper>

  {#if hasSources}
    <SourcePaper
      {expanded}
      contentId={sourceContentId}
      label={m.tracker_row_sources_label({
        name: isSpoilered ? m.tracker_row_spoilered_item() : name,
      })}
      {sources}
      {sourceSegments}
      {sourceBadges}
      onToggle={() => {
        expanded = !expanded;
      }}
    />
  {/if}
</div>

<style>
  .tracker-row {
    --tracker-paper-border-width: 1px;
    --tracker-paper-line: color-mix(in srgb, var(--hairline) 42%, transparent);
    --tracker-paper-radius: 2px;
    --tracker-peek-size: 27px;
    --tracker-row-gap: 7px;
    --tracker-sheet-gap: 6px;
    --tracker-source-inset: calc(var(--tracker-target-size) + var(--tracker-row-gap));
    --tracker-paper-border-start-width: var(--tracker-paper-border-width);
    --tracker-paper-start-start-radius: var(--tracker-paper-radius);
    --tracker-paper-start-end-radius: var(--tracker-paper-radius);
    --tracker-paper-end-start-radius: var(--tracker-paper-radius);
    --tracker-paper-end-end-radius: var(--tracker-paper-radius);
    --tracker-source-end-start-radius: 0px;
    --tracker-source-end-end-radius: var(--tracker-paper-radius);

    position: relative;
  }

  .tracker-row--dimmed {
    color: var(--ink-muted);
  }

  .tracker-row--completed {
    color: var(--ink-muted);
    text-decoration: line-through;
  }

  .tracker-row__label {
    min-width: 0;
    flex: 1;
    font-size: 1rem;
    line-height: 1.3;
  }

  .tracker-row__subtitle {
    display: block;
    font-size: 0.875rem;
    color: var(--ink-muted);
  }

  .tracker-row__active-badge {
    font-family: var(--font-data);
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--fg-amber);
  }
</style>
