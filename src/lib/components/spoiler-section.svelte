<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import SectionTrigger from "#lib/components/section-trigger.svelte";
  import Spoiler from "#lib/components/spoiler.svelte";
  import * as m from "#lib/paraglide/messages.js";

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
      Hidden sections share the visible headers' button, with no progress count or rule. The whole
      row reveals the section, as its hover promises, so the mask inside is only a picture.
    -->
    <SectionTrigger
      class="text-base"
      aria-label={m.spoiler_reveal_aria()}
      onclick={() => (spoilerDismissed = true)}
    >
      <Icon.UI type="disclosure" class="section-disclosure size-4 shrink-0" />
      <span class="font-semibold">
        <Spoiler interactive={false}>{name}</Spoiler>
      </span>
    </SectionTrigger>
  </div>
{/if}
