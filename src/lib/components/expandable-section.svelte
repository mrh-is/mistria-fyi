<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";
  import { slide } from "svelte/transition";

  import type { Snippet } from "svelte";

  let {
    children,
    count,
    name,
    open = false,
    total,
  }: {
    children: Snippet;
    count?: number;
    name: string;
    open?: boolean;
    total?: number;
  } = $props();

  // svelte-ignore state_referenced_locally -- `open` used as initial value only
  let expanded = $state(open);
</script>

<div>
  <button
    class="hover:bg-accent/50 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
    onclick={() => (expanded = !expanded)}
    type="button"
  >
    <ChevronRight
      class="text-muted-foreground size-4 shrink-0 transition-transform {expanded
        ? 'rotate-90'
        : ''}"
    />
    <span class="flex-1 font-medium">{name}</span>
    {#if total !== undefined && count !== undefined}
      <span class="text-muted-foreground text-xs">{count}/{total}</span>
    {/if}
  </button>

  {#if expanded}
    <div class="pl-6" transition:slide={{ duration: 150 }}>
      {@render children()}
    </div>
  {/if}
</div>
