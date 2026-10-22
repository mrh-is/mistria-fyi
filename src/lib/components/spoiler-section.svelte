<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import SectionTrigger from "#lib/components/section-trigger.svelte";
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
    <!-- Hidden sections share the visible headers' surface, with no progress count or rule. -->
    <SectionTrigger element="div" class="text-base">
      <Icon.UI type="disclosure" class="size-4 shrink-0 text-muted-foreground" />
      <span class="font-medium">
        <Spoiler onReveal={() => (spoilerDismissed = true)}>{name}</Spoiler>
      </span>
    </SectionTrigger>
  </div>
{/if}
