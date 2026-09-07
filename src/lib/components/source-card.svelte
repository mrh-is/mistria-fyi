<script lang="ts">
  import { Icon } from "$lib/components/icon/index.js";
  import RestrictionBadges from "$lib/components/restriction-badges.svelte";
  import SourceSegmentText from "$lib/components/source-segment-text.svelte";

  import type { DisplayBadges } from "$lib/engine/availability-condition.js";
  import type { Source } from "$lib/types/acquisition";
  import type { SourceSegment } from "$lib/utils/source-segments.js";

  let {
    sourceBadges,
    sources,
    sourceSegments,
  }: {
    sourceBadges: DisplayBadges[];
    sources: Source[];
    sourceSegments: SourceSegment[][];
  } = $props();

  function hasBadges(b: DisplayBadges): boolean {
    return Boolean(b.seasons ?? b.weathers ?? b.timeRange);
  }
</script>

<div class="source-card">
  {#each sources as source, i (i)}
    <div class="source-card__line" data-source-type={source.type}>
      <span class="source-card__info">
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

<style>
  .source-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .source-card__line {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px 8px;
    font-size: 0.875rem;
  }

  .source-card__info {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-muted);
  }
</style>
