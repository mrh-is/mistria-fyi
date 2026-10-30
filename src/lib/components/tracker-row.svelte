<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";

  import SourcePaper from "#lib/components/source-paper.svelte";
  import Spoiler from "#lib/components/spoiler.svelte";
  import SpritePreviewButton from "#lib/components/sprite-preview-button.svelte";
  import TrackerCheckbox from "#lib/components/tracker-checkbox.svelte";
  import TrackerPaper from "#lib/components/tracker-paper.svelte";
  import { extractDisplayBadges } from "#lib/engine/availability-condition.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { buildSourceSegments } from "#lib/sources/source-segments.js";
  import { ROW_LEAVE_DELAY_MS, ROW_LEAVE_FADE_MS } from "#lib/utils/row-timing.js";
  import { page } from "$app/state";

  import type { SpriteSlotState } from "#lib/components/sprite-slot.svelte";
  import type { CheckboxState } from "#lib/components/tracker-checkbox.svelte";
  import type { DisplayBadges } from "#lib/engine/availability-condition.js";
  import type { CategoryKey } from "#lib/engine/categories.js";
  import type { ReportCategory } from "#lib/feedback/types.js";
  import type { SegmentLookups, SourceSegment } from "#lib/sources/source-segments.js";
  import type { Source } from "#lib/types/acquisition.js";
  import type { TrackerRowDisplay } from "#lib/utils/row-display.js";

  const feedbackContext = getFeedbackContext();

  let {
    category,
    display,
    name,
    onToggle,
    reportCategory,
    reportEntityId,
    reportExtra,
    segmentLookups,
    sources = [],
    sprite,
    spriteClass = "text-primary",
    subtitle,
  }: {
    category?: CategoryKey;
    display: TrackerRowDisplay;
    name: string;
    onToggle: () => void;
    reportCategory: ReportCategory;
    reportEntityId: string;
    reportExtra?: Record<string, number | string>;
    segmentLookups?: SegmentLookups;
    sources?: Source[];
    sprite?: string;
    spriteClass?: string;
    subtitle?: string;
  } = $props();

  const rawInstanceId = $props.id();
  const instanceId = rawInstanceId.replaceAll(/[^a-zA-Z0-9_-]/g, "-");

  let expanded = $state(false);
  let spoilerDismissed = $state(false);
  let hasSources = $derived(sources.length > 0);
  let sourceBadges: DisplayBadges[] = $derived(
    sources.map((source) => {
      const condition = "availability" in source ? source.availability : undefined;
      return condition ? extractDisplayBadges(condition) : {};
    }),
  );
  let sourceSegments: SourceSegment[][] = $derived(
    segmentLookups ? sources.map((source) => buildSourceSegments(source, segmentLookups)) : [],
  );

  let isCompleted = $derived(display.mode === "completed");
  let isObtained = $derived(display.mode === "obtained");
  let isSpoilered = $derived(display.mode === "spoilered" && !spoilerDismissed);
  let isLeaving = $derived(display.mode === "completed" && (display.leaving ?? false));
  let isDimmed = $derived(display.mode === "incomplete" && (display.dimmed ?? false));
  let sourceContentId = $derived(
    `sources-${reportEntityId
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "")}-${instanceId}`,
  );
  let sourceState = $derived.by(() => {
    if (!hasSources) return "none";
    return expanded ? "open" : "closed";
  });

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
  let checkboxState: CheckboxState = $derived.by(() => {
    if (isCompleted) return "checked";
    return isObtained ? "obtained" : "unchecked";
  });
  let spriteState: SpriteSlotState = $derived.by(() => {
    if (isSpoilered) return "spoilered";
    return isCompleted ? "complete" : "ready";
  });

  function leaveTransition(node: Element) {
    if (
      !(node instanceof HTMLElement) ||
      node.dataset.leaving !== "true" ||
      prefersReducedMotion.current
    ) {
      return { duration: 0 };
    }
    return {
      css: (t: number) => `opacity: ${t}; pointer-events: none;`,
      delay: ROW_LEAVE_DELAY_MS,
      duration: ROW_LEAVE_FADE_MS,
      tick: (t: number) => {
        if (t === 0) {
          node.style.height = "0";
          node.style.overflow = "hidden";
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
    const shouldFocusAdjacentRow = display.mode === "incomplete";
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
  style:--primary={category ? `var(--color-category-${category})` : undefined}
  data-tracker-row
  data-source-state={sourceState}
  out:leaveTransition
  data-leaving={isLeaving}
  {@attach feedbackContext.reportableAttachment(reportable)}
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
      <SpritePreviewButton
        {sprite}
        state={spriteState}
        class={spriteClass}
        label={m.tracker_row_preview_sprite({ name })}
      />
    {/if}

    <span class="tracker-row__label">
      {#if isSpoilered}
        <Spoiler onReveal={() => (spoilerDismissed = true)}>
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
    color: var(--color-ink-muted);
  }

  .tracker-row--completed {
    color: var(--color-ink-muted);
    text-decoration: line-through;
  }

  .tracker-row__label {
    min-width: 0;
    flex: 1;
    font-size: var(--text-base);
    line-height: 1.3;
  }

  .tracker-row__subtitle {
    display: block;
    font-size: var(--text-sm);
    color: var(--color-ink-muted);
  }

  .tracker-row__active-badge {
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    font-weight: 600;
    color: var(--color-tracker-active);
  }
</style>
