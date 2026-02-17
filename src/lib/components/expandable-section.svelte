<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";
  import { slide } from "svelte/transition";

  import type { Snippet } from "svelte";

  let {
    children,
    count,
    forceOpen = false,
    name,
    total,
  }: {
    children: Snippet;
    count?: number;
    forceOpen?: boolean;
    name: string;
    total?: number;
  } = $props();

  let expanded = $state(false);
  let isOpen = $derived(expanded || forceOpen);
</script>

<div>
  <button
    class="flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left text-base hover:bg-accent/50"
    onclick={() => (expanded = !expanded)}
    type="button"
    aria-expanded={isOpen}
  >
    <ChevronRight
      class="size-4 shrink-0 text-muted-foreground transition-transform {isOpen ? 'rotate-90' : ''}"
    />
    <span class="flex-1 font-medium">{name}</span>
    {#if total !== undefined && count !== undefined}
      <span class="text-sm text-muted-foreground">{count}/{total}</span>
    {/if}
  </button>

  {#if isOpen}
    <div class="pl-6" transition:slide={{ duration: 150 }}>
      {@render children()}
    </div>
  {/if}
</div>
