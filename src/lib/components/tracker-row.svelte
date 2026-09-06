<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { slide } from "svelte/transition";

  import { page } from "$app/state";
  import { Icon } from "$lib/components/icon/index.js";
  import ItemSprite from "$lib/components/item-sprite.svelte";
  import RestrictionBadges from "$lib/components/restriction-badges.svelte";
  import SourceSegmentText from "$lib/components/source-segment-text.svelte";
  import Spoiler from "$lib/components/spoiler.svelte";
  import { extractDisplayBadges } from "$lib/engine/availability-condition.js";
  import { getFeedbackContextOrFallback } from "$lib/feedback/context.svelte.js";
  import { buildSourceSegments } from "$lib/utils/source-segments.js";

  import type { ItemSpriteState } from "$lib/components/item-sprite.svelte";
  import type { DisplayBadges } from "$lib/engine/availability-condition.js";
  import type { FeedbackContext } from "$lib/feedback/context.svelte.js";
  import type { QuestState } from "$lib/stores/user-state.svelte.js";
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

  let expanded = $state(false);
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

  let completionState: QuestState = $derived(
    isCompleted ? "completed" : isObtained ? "obtained" : "none",
  );
  let spriteState: ItemSpriteState = $derived(
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

  function hasBadges(b: DisplayBadges): boolean {
    return Boolean(b.seasons ?? b.weathers ?? b.timeRange);
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
  <div class="tracker-row__paper-area relative">
    <!-- Row paper: the main content with a permanent diagonal cut when sources exist -->
    <div
      class="tracker-row__paper relative z-[3] bg-[var(--paper)] transition-[box-shadow] duration-200 motion-reduce:transition-none
        {hasSources
        ? 'hover:shadow-[0_1px_4px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_1px_4px_rgba(0,0,0,0.3)]'
        : ''}"
    >
      <div
        class="flex items-center gap-0 pr-2 transition-opacity duration-200 motion-reduce:transition-none
          {isDimmed ? 'text-muted-foreground' : ''}
          {isCompleted || isLeaving ? 'text-muted-foreground line-through' : ''}"
      >
        <button
          class="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
          type="button"
          aria-label={isCompleted
            ? `Uncheck ${name}`
            : isSpoilered
              ? "Check spoilered item"
              : `Check ${name}`}
          onclick={handleToggle}
        >
          <Icon.Completion
            state={completionState}
            class="size-5 {isCompleted
              ? 'text-green-600 dark:text-green-400'
              : isObtained
                ? 'text-amber-500 dark:text-amber-400'
                : 'text-muted-foreground'}"
          />
        </button>

        {#if sprite}
          <ItemSprite {sprite} state={spriteState} class="mr-1 size-10 {spriteClass}" />
        {/if}

        <span class="min-w-0 flex-1 text-base">
          {#if isSpoilered}
            <Spoiler onReveal={() => (spoilerRevealed = true)}>
              {name}
              {#if subtitle}
                <span class="text-sm text-muted-foreground">{subtitle}</span>
              {/if}
            </Spoiler>
          {:else}
            {name}
            {#if subtitle}
              <span class="text-sm text-muted-foreground">{subtitle}</span>
            {/if}
          {/if}
        </span>

        {#if isObtained}
          <span class="text-sm text-amber-600 dark:text-amber-400">Active</span>
        {/if}
      </div>
    </div>

    <!-- Corner-peek grab triangle: visible through the notch in the row paper -->
    {#if hasSources}
      <button
        class="tracker-row__grab z-[2] flex items-end justify-end bg-[var(--paper-deep)]"
        type="button"
        aria-expanded={expanded}
        aria-controls={sourceContentId}
        aria-label="{isSpoilered ? 'Spoilered item' : name} sources"
        onclick={() => {
          expanded = !expanded;
        }}
      >
        <svg
          class="size-3 text-[var(--ink-muted)] transition-transform duration-200 motion-reduce:transition-none"
          style:transform="rotate({expanded ? -135 : 45}deg)"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 1L7 5L3 9"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Source card: slides out below the row -->
  {#if expanded && hasSources}
    <div
      id={sourceContentId}
      class="relative z-[1] bg-[var(--paper-deep)] px-3 py-2"
      transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
    >
      <div class="flex flex-col gap-1.5">
        {#each sources as source, i (i)}
          <div
            class="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-sm"
            data-source-type={source.type}
          >
            <span class="flex items-center gap-2 text-muted-foreground">
              <Icon.Source type={source.type} class="size-3.5 shrink-0" />
              {#if sourceSegments[i]}
                <SourceSegmentText segments={sourceSegments[i]} />
              {/if}
            </span>
            {#if hasBadges(sourceBadges[i])}
              <RestrictionBadges badges={sourceBadges[i]} />
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .tracker-row {
    position: relative;
  }

  .tracker-row--has-sources .tracker-row__paper {
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 26px), calc(100% - 26px) 100%, 0 100%);
  }

  .tracker-row__grab {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 26px;
    height: 26px;
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
    padding: 3px;
  }

  .tracker-row__grab::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 141.4%;
    height: 1px;
    background: var(--hairline);
    transform: translate(-50%, -50%) rotate(-45deg);
    pointer-events: none;
  }
</style>
