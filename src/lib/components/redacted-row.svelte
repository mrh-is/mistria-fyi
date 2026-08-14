<script lang="ts">
  import { Lock } from "@lucide/svelte";
  import { slide } from "svelte/transition";

  import CompletionRow from "$lib/components/completion-row.svelte";
  import { Icon } from "$lib/components/icon/index.js";

  import type { RecipeSource } from "$lib/types/tracker-data.js";

  let {
    completed,
    name,
    onToggle,
    redaction,
    sourceLabels = [],
    sources = [],
  }: {
    completed: boolean;
    name: string;
    onToggle: () => void;
    redaction: "redacted" | "source-only" | "visible";
    sourceLabels?: string[];
    sources?: RecipeSource[];
  } = $props();

  let uniqueSourceTypes = $derived([...new Set(sources.map((s) => s.type))]);

  let expanded = $state(false);
</script>

{#if redaction === "visible" || completed}
  <CompletionRow {completed} {name} {onToggle} />
{:else}
  <div>
    <div class="flex items-center gap-0 rounded-md pr-2">
      <button
        class="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
        type="button"
        aria-label="Redacted item"
        onclick={onToggle}
      >
        <Lock class="size-4 text-muted-foreground/50" />
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
        {#each sources as source, i (i)}
          <div class="flex items-center gap-2 text-sm">
            <Icon.Source type={source.type} class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="text-muted-foreground">{sourceLabels[i] ?? source.type}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
