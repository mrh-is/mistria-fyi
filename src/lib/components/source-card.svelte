<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import RestrictionBadges from "#lib/components/restriction-badges.svelte";
  import SourceSegmentText from "#lib/components/source-segment-text.svelte";

  import type { DisplayBadges } from "#lib/engine/availability-condition.js";
  import type { SourceSegment } from "#lib/sources/source-segments.js";
  import type { Source } from "#lib/types/acquisition.js";

  let {
    sourceBadges,
    sources,
    sourceSegments,
  }: {
    sourceBadges: DisplayBadges[];
    sources: Source[];
    sourceSegments: SourceSegment[][];
  } = $props();

  function hasTimingContext(b: DisplayBadges): boolean {
    return Boolean(b.seasons ?? b.weathers ?? b.timeRange);
  }
</script>

<div class="source-card" data-testid="source-card">
  {#each sources as source, i (i)}
    <div class="source-card__line" data-source-type={source.type}>
      <Icon.Source type={source.type} class="source-card__icon" />
      <span class="source-card__description">
        {#if sourceSegments[i]?.length}
          <SourceSegmentText segments={sourceSegments[i]} />
        {/if}
      </span>
      {#if hasTimingContext(sourceBadges[i])}
        <span class="source-card__restrictions">
          <RestrictionBadges badges={sourceBadges[i]} />
        </span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .source-card {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .source-card__line {
    display: grid;
    grid-template-columns: 1rem minmax(0, auto) minmax(min-content, 1fr);
    align-items: center;
    gap: 4px 8px;
    font-size: var(--text-sm);
    line-height: 1.3;
  }

  :global(.source-card__icon) {
    width: 1rem;
    height: 1rem;
    color: color-mix(in srgb, var(--ink-muted) 78%, transparent);
  }

  .source-card__description {
    color: var(--ink-muted);
  }

  .source-card__restrictions {
    min-width: 0;
  }

  @media (max-width: 26rem) {
    .source-card__line {
      grid-template-columns: 1rem minmax(0, 1fr);
    }

    .source-card__restrictions {
      grid-column: 2;
    }
  }
</style>
