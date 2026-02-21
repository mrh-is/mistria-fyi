<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";
  import { slide } from "svelte/transition";

  import ItemDetail from "$lib/components/item-detail.svelte";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";

  import type { Source } from "$lib/types/tracker-data.js";

  let {
    completed,
    name,
    onToggle,
    sources,
  }: {
    completed: boolean;
    name: string;
    onToggle: () => void;
    sources: Source[];
  } = $props();

  let expanded = $state(false);
</script>

<div>
  <div class="flex items-center gap-0 rounded-md pr-2 {completed ? 'line-through opacity-40' : ''}">
    <button
      class="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
      type="button"
      aria-label={completed ? `Uncheck ${name}` : `Check ${name}`}
      onclick={onToggle}
    >
      <Checkbox checked={completed} tabindex={-1} />
    </button>
    {#if sources.length > 0}
      <button
        class="group inline-flex min-w-0 flex-1 items-center gap-0.5 text-left text-base"
        type="button"
        aria-expanded={expanded}
        aria-label="{name} details"
        onclick={() => {
          expanded = !expanded;
        }}
      >
        <span class="group-hover:underline">{name}</span>
        <ChevronRight
          class="size-3 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-60 {expanded
            ? 'rotate-90'
            : ''}"
        />
      </button>
    {:else}
      <span class="min-w-0 flex-1 text-left text-base">{name}</span>
    {/if}
  </div>
  {#if expanded && sources.length > 0}
    <div transition:slide={{ duration: 150 }}>
      <ItemDetail {sources} />
    </div>
  {/if}
</div>
