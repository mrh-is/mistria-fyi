<script lang="ts">
  import { slide } from "svelte/transition";

  import { Icon } from "$lib/components/icon/index.js";
  import RestrictionBadges from "$lib/components/restriction-badges.svelte";
  import SourceList from "$lib/components/source-list.svelte";
  import { getDisplayBadges } from "$lib/engine/availability.js";
  import { buildSourceSegments } from "$lib/utils/source-segments.js";

  import type { DisplayBadges } from "$lib/engine/availability-condition.js";
  import type { AcquisitionSource } from "$lib/types/tracker-data.js";
  import type { SegmentLookups, SourceSegment } from "$lib/utils/source-segments.js";

  export type TrackerRowDisplay =
    | { dimmed?: boolean; mode: "visible" }
    | { leaving?: boolean; mode: "completed" }
    | { mode: "redacted" };

  let {
    display,
    lookups,
    name,
    onToggle,
    sources = [],
  }: {
    display: TrackerRowDisplay;
    lookups?: SegmentLookups;
    name: string;
    onToggle: () => void;
    sources?: AcquisitionSource[];
  } = $props();

  let uniqueSourceTypes = $derived([...new Set(sources.map((s) => s.type))]);
  let badges: DisplayBadges = $derived(getDisplayBadges(sources));
  let sourceSegments: SourceSegment[][] = $derived(
    lookups ? sources.map((s) => buildSourceSegments(s, lookups)) : [],
  );

  let expanded = $state(false);

  let isCompleted = $derived(display.mode === "completed");
  let isRedacted = $derived(display.mode === "redacted");
  let isLeaving = $derived(display.mode === "completed" && (display.leaving ?? false));
  let isDimmed = $derived(display.mode === "visible" && (display.dimmed ?? false));

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

<div out:completeOut data-leaving={isLeaving}>
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
        : isRedacted
          ? "Check redacted item"
          : `Check ${name}`}
      onclick={onToggle}
    >
      <Icon.Completion
        state={isCompleted ? "completed" : "none"}
        class="size-5 {isCompleted
          ? 'text-green-600 dark:text-green-400'
          : 'text-muted-foreground/50'}"
      />
    </button>

    {#if isRedacted}
      <span class="min-w-0 flex-1 text-base text-muted-foreground italic">Redacted</span>
    {:else}
      <span class="min-w-0 flex-1 text-base">{name}</span>
    {/if}

    {#if uniqueSourceTypes.length > 0}
      <button
        class="group flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted"
        type="button"
        aria-expanded={expanded}
        aria-label="{isRedacted ? 'Redacted item' : name} sources"
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

    {#if (badges.seasons ?? badges.weathers ?? badges.timeRange) && !isRedacted}
      <RestrictionBadges {badges} />
    {/if}
  </div>

  {#if expanded && sources.length > 0}
    <div class="flex flex-col gap-1 py-1 pr-2 pl-8" transition:slide={{ duration: 150 }}>
      <SourceList {sources} {sourceSegments} />
    </div>
  {/if}
</div>
