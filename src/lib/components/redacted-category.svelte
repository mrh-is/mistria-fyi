<script lang="ts">
  import { Lock } from "@lucide/svelte";

  import type { Snippet } from "svelte";

  let {
    children,
    revealed,
  }: {
    children: Snippet;
    revealed: boolean;
  } = $props();
</script>

{#if revealed}
  {@render children()}
{:else}
  <div class="flex items-center gap-2 rounded-md px-2 py-1.5">
    <Lock class="size-4 shrink-0 text-muted-foreground/50" />
    <span class="min-w-0 flex-1 text-base text-muted-foreground italic">Redacted</span>
  </div>
{/if}
