<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import Spoiler from "#lib/components/spoiler.svelte";

  import type { Snippet } from "svelte";

  let {
    children,
    name,
    spoilered,
  }: {
    children: Snippet;
    name: string;
    spoilered: boolean;
  } = $props();

  let spoilerDismissed = $state(false);
  let isSpoilered = $derived(spoilered && !spoilerDismissed);
</script>

{#if !isSpoilered}
  {@render children()}
{:else}
  <div>
    <div
      class="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-base hover:bg-accent/50"
    >
      <Icon.UI type="disclosure" class="size-4 shrink-0 text-muted-foreground" />
      <span class="flex-1 font-medium">
        <Spoiler onReveal={() => (spoilerDismissed = true)}>{name}</Spoiler>
      </span>
    </div>
  </div>
{/if}
