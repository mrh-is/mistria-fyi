<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  // oxlint-disable-next-line import/no-self-import, import/no-cycle -- Svelte requires a recursive component to import itself
  import SourceSegmentText from "#lib/components/source-segment-text.svelte";
  import Spoiler from "#lib/components/spoiler.svelte";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import type { SourceSegment } from "#lib/sources/source-segments.js";

  let { segments }: { segments: SourceSegment[] } = $props();

  const unspoileredSegments = new SvelteSet<number>();

  function revealSegment(index: number) {
    unspoileredSegments.add(index);
  }
</script>

{#each segments as segment, i (i)}
  {#if typeof segment === "string"}
    {segment}
  {:else if "spoilered" in segment && segment.spoilered === true}
    <span
      class="inline-block rounded-sm bg-muted-foreground/25 align-baseline text-transparent select-none"
    >
      <span class="sr-only">{m.source_spoilered()}</span>
      <span aria-hidden="true">███</span>
    </span>
  {:else if "condition" in segment}
    {@const visible = isConditionVisible(segment.condition, userState.progressionState)}
    {#if visible || unspoileredSegments.has(i)}
      <SourceSegmentText segments={segment.unspoilered} />
    {:else}
      <Spoiler
        onReveal={() => {
          revealSegment(i);
        }}
      >
        <SourceSegmentText segments={segment.unspoilered} />
      </Spoiler>
    {/if}
  {/if}
{/each}
