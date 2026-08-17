<script lang="ts">
  import { isSourceAvailable } from "$lib/engine/availability.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { AcquisitionSource } from "$lib/types/tracker-data.js";

  let { sources }: { sources: AcquisitionSource[] } = $props();

  // ItemDetail's source labeling remains basic; Task 4 removes this component entirely.
  function typeLabel(type: string): string {
    return type.replace(/_/g, " ");
  }
</script>

<div class="flex flex-col gap-1 py-1 pr-2 pl-8">
  {#each sources as source, i (i)}
    {@const available = isSourceAvailable(
      source,
      userState.state.worldState,
      userState.state.availabilityMode === "everything"
        ? "available"
        : userState.state.availabilityMode,
    )}
    <div class="flex items-center gap-2 text-sm {available ? '' : 'opacity-40'}">
      <span class="size-1.5 shrink-0 rounded-full {available ? 'bg-green-500' : 'bg-red-400'}"
      ></span>
      <span class="font-medium">{typeLabel(source.type)}</span>
    </div>
  {/each}
  {#if sources.length === 0}
    <span class="text-sm text-muted-foreground">No source data</span>
  {/if}
</div>
