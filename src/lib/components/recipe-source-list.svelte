<script lang="ts">
  import { Icon } from "$lib/components/icon/index.js";
  import SourceSegmentText from "$lib/components/source-segment-text.svelte";

  import type { RecipeSource } from "$lib/types/tracker-data.js";
  import type { SourceSegment } from "$lib/utils/source-segments.js";

  let {
    sources,
    sourceSegments,
  }: {
    sources: RecipeSource[];
    sourceSegments: SourceSegment[][];
  } = $props();
</script>

{#each sources as source, i (i)}
  <div class="flex items-center gap-2 text-sm" data-source-type={source.type}>
    <Icon.Source type={source.type} class="size-3.5 shrink-0 text-muted-foreground" />
    <span class="text-muted-foreground">
      <SourceSegmentText segments={sourceSegments[i]} />
    </span>
  </div>
{/each}
