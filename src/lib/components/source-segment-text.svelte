<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  // oxlint-disable-next-line import/no-self-import, import/no-cycle -- Svelte requires a recursive component to import itself
  import SourceSegmentText from "#lib/components/source-segment-text.svelte";
  import Spoiler from "#lib/components/spoiler.svelte";
  import { isVisible } from "#lib/engine/visibility.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import type { SourceSegment } from "#lib/sources/source-segments.js";

  let { segments }: { segments: SourceSegment[] } = $props();

  const revealedSegments = new SvelteSet<number>();

  function revealSegment(index: number) {
    revealedSegments.add(index);
  }
</script>

{#each segments as segment, i (i)}
  {#if typeof segment === "string"}
    {segment}
  {:else if "redacted" in segment && segment.redacted === true}
    <span
      class="inline-block rounded-sm bg-muted-foreground/25 align-baseline text-transparent select-none"
    >
      <span class="sr-only">{m.source_hidden()}</span>
      <span aria-hidden="true">███</span>
    </span>
  {:else if "condition" in segment}
    {@const visible = isVisible(segment.condition, userState.progressionState)}
    {#if visible || revealedSegments.has(i)}
      <SourceSegmentText segments={segment.revealed} />
    {:else}
      <Spoiler
        onReveal={() => {
          revealSegment(i);
        }}
      >
        <SourceSegmentText segments={segment.revealed} />
      </Spoiler>
    {/if}
  {/if}
{/each}
