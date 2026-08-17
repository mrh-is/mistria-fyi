<script lang="ts">
  import { slide } from "svelte/transition";

  import { Icon } from "$lib/components/icon/index.js";
  import RecipeSourceList from "$lib/components/recipe-source-list.svelte";

  import type { AcquisitionSource } from "$lib/types/tracker-data.js";
  import type { SourceSegment } from "$lib/utils/source-segments.js";

  let {
    completed,
    name: _name,
    onToggle,
    sourceLabels = [],
    sources = [],
    sourceSegments = [],
  }: {
    completed: boolean;
    name: string;
    onToggle: () => void;
    sourceLabels?: string[];
    sources?: AcquisitionSource[];
    sourceSegments?: SourceSegment[][];
  } = $props();

  let uniqueSourceTypes = $derived([...new Set(sources.map((s) => s.type))]);

  let expanded = $state(false);
</script>

<div>
  <div class="flex items-center gap-0 rounded-md pr-2">
    <button
      class="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
      type="button"
      aria-label={completed ? "Uncheck redacted item" : "Check redacted item"}
      onclick={onToggle}
    >
      <Icon.Completion
        state={completed ? "completed" : "none"}
        class="size-4 {completed
          ? 'text-green-600 dark:text-green-400'
          : 'text-muted-foreground/50'}"
      />
    </button>
    <span class="min-w-0 flex-1 text-base text-muted-foreground italic">Redacted</span>
    {#if uniqueSourceTypes.length > 0}
      <button
        class="group flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted"
        type="button"
        aria-expanded={expanded}
        aria-label="Redacted item sources"
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
  </div>
  {#if expanded && sources.length > 0}
    <div class="flex flex-col gap-1 py-1 pr-2 pl-8" transition:slide={{ duration: 150 }}>
      {#if sourceSegments.length > 0}
        <RecipeSourceList {sourceSegments} {sources} />
      {:else}
        {#each sources as source, i (i)}
          <div class="flex items-center gap-2 text-sm">
            <Icon.Source type={source.type} class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="text-muted-foreground">{sourceLabels[i] ?? source.type}</span>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
