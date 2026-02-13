<script lang="ts">
  import RestrictionBadges from "$lib/components/restriction-badges.svelte";
  import { isSourceAvailable } from "$lib/engine/availability.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { locationLabel, sourceTypeLabel } from "$lib/utils/format.js";

  import type { Source } from "$lib/types/tracker-data.js";

  let { sources }: { sources: Source[] } = $props();
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
      <span class="font-medium">{sourceTypeLabel(source.type)}</span>
      {#if source.location}
        <span class="truncate text-muted-foreground">{locationLabel(source.location)}</span>
      {/if}
      {#if source.restrictions && source.restrictions.length > 0}
        <RestrictionBadges restrictions={source.restrictions} />
      {/if}
    </div>
  {/each}
  {#if sources.length === 0}
    <span class="text-sm text-muted-foreground">No source data</span>
  {/if}
</div>
