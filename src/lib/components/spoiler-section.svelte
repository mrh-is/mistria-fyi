<script lang="ts">
  import Spoiler from "$lib/components/spoiler.svelte";

  import type { Snippet } from "svelte";

  let {
    children,
    revealed,
  }: {
    children: Snippet;
    revealed: boolean;
  } = $props();

  let spoilerRevealed = $state(false);
  let effectivelyRevealed = $derived(revealed || spoilerRevealed);
</script>

{#if effectivelyRevealed}
  {@render children()}
{:else}
  <div class="flex min-h-11 items-center rounded-md px-2">
    <Spoiler onReveal={() => (spoilerRevealed = true)}>
      <span class="text-base text-muted-foreground">Hidden section</span>
    </Spoiler>
  </div>
{/if}
