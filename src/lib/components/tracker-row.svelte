<script lang="ts">
  import { slide } from "svelte/transition";

  import { page } from "$app/state";
  import { Icon } from "$lib/components/icon/index.js";
  import RestrictionBadges from "$lib/components/restriction-badges.svelte";
  import SourceList from "$lib/components/source-list.svelte";
  import Spoiler from "$lib/components/spoiler.svelte";
  import { getDisplayBadges } from "$lib/engine/availability.js";
  import { getFeedbackContextOrFallback } from "$lib/feedback/context.svelte.js";
  import { buildSourceSegments } from "$lib/utils/source-segments.js";

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
    subtitle?: string;
  } = $props();

  let uniqueSourceTypes = $derived([...new Set(sources.map((s) => s.type))]);
  let badges: DisplayBadges = $derived(getDisplayBadges(sources));
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

  function completeOut(node: Element) {
    if (node.getAttribute("data-leaving") !== "true") return { duration: 0 };
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
</script>

<div out:completeOut data-leaving={isLeaving} {@attach feedbackContext.reportable(reportable)}>
  <div
    class="flex items-center gap-0 rounded-md pr-2 transition-opacity duration-200
      {isDimmed ? 'opacity-50' : ''}
      {isCompleted || isLeaving ? 'line-through opacity-40' : ''}"
  >
    <button
      class="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
      type="button"
      aria-label={isCompleted
        ? `Uncheck ${name}`
        : isSpoilered
          ? "Check spoilered item"
          : `Check ${name}`}
      onclick={onToggle}
    >
      <Icon.Completion
        state={completionState}
        class="size-5 {isCompleted
          ? 'text-green-600 dark:text-green-400'
          : isObtained
            ? 'text-amber-500 dark:text-amber-400'
            : 'text-muted-foreground/50'}"
      />
    </button>

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

    {#if uniqueSourceTypes.length > 0}
      <button
        class="group flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted"
        type="button"
        aria-expanded={expanded}
        aria-controls={sourceContentId}
        aria-label="{isSpoilered ? 'Spoilered item' : name} sources"
        onclick={() => {
          expanded = !expanded;
        }}
      >
        {#each uniqueSourceTypes as sourceType (sourceType)}
          <Icon.Source type={sourceType} class="size-3.5 shrink-0" />
        {/each}
        <Icon.UI
          type="disclosure"
          class="size-3 shrink-0 opacity-40 transition-transform {expanded ? 'rotate-90' : ''}"
        />
      </button>
    {/if}

    {#if badges.seasons ?? badges.weathers ?? badges.timeRange}
      <RestrictionBadges {badges} />
    {/if}
  </div>

  {#if sources.length > 0}
    <div
      id={sourceContentId}
      class="flex flex-col gap-1 py-1 pr-2 pl-8"
      hidden={!expanded}
      transition:slide={{ duration: 150 }}
    >
      <SourceList {sources} {sourceSegments} />
    </div>
  {/if}
</div>
