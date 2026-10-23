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
    <!--
      Hidden sections share the visible headers' surface, with no progress count or rule. Only the
      spoiler mask reveals the section; the row itself is inert.
    -->
    <SectionTrigger element="div" class="text-base">
      <Icon.UI type="disclosure" class="section-disclosure size-4 shrink-0" />
      <span class="font-semibold">
        <Spoiler onReveal={() => (spoilerDismissed = true)}>{name}</Spoiler>
      </span>
    </SectionTrigger>
  </div>
{/if}
