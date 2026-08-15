<script lang="ts">
  import { isVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SourceSegmentText from "./source-segment-text.svelte";

  import type { SourceSegment } from "$lib/utils/source-segments.js";

  let { segments }: { segments: SourceSegment[] } = $props();
</script>

{#each segments as segment, i (i)}
  {#if typeof segment === "string"}
    {segment}
  {:else if "redacted" in segment && segment.redacted === true}
    <span class="redacted-block inline-block align-baseline">
      <span class="sr-only">Redacted</span>
      <span aria-hidden="true">███</span>
    </span>
  {:else if "condition" in segment}
    {@const visible = isVisible(segment.condition, userState.progressionState)}
    {#if visible}
      <SourceSegmentText segments={segment.revealed} />
    {:else if segment.redacted}
      <SourceSegmentText segments={segment.redacted} />
    {:else}
      <span class="redacted-block inline-block align-baseline">
        <span class="sr-only">Redacted</span>
        <span aria-hidden="true">███</span>
      </span>
    {/if}
  {/if}
{/each}

<style>
  .redacted-block {
    background: var(--muted);
    border-radius: 0.25rem;
    color: transparent;
    user-select: none;
  }
</style>
