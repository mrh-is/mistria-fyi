<script lang="ts">
  import { Lock } from "@lucide/svelte";

  import CompletionRow from "$lib/components/completion-row.svelte";

  import type { VisibilityCondition } from "$lib/types/visibility.js";

  let {
    completed,
    entityVisibility: _entityVisibility,
    name,
    onToggle,
    redaction,
    sources = [],
    sourceVisibility: _sourceVisibility,
  }: {
    completed: boolean;
    entityVisibility: VisibilityCondition;
    name: string;
    onToggle: () => void;
    redaction: "redacted" | "source-only" | "visible";
    sources?: { label: string }[];
    sourceVisibility?: VisibilityCondition;
  } = $props();
</script>

{#if redaction === "visible"}
  <CompletionRow {completed} {name} {onToggle} />
{:else}
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
    {#if redaction === "source-only" && sources.length > 0}
      <span class="shrink-0 text-sm text-muted-foreground">
        {sources.map((s) => s.label).join(", ")}
      </span>
    {/if}
  </div>
{/if}
