<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import SectionTrigger from "#lib/components/section-trigger.svelte";
  import Spoiler from "#lib/components/spoiler.svelte";
  import { registerCompletionSection } from "#lib/controllers/completion-scope.svelte.js";

  import type { Snippet } from "svelte";

  let {
    children,
    name,
    spoilered,
    topLevel = false,
  }: {
    children: Snippet;
    name: string;
    spoilered: boolean;
    /** Stands in for a top-level section, which Everything partitions by completion. */
    topLevel?: boolean;
  } = $props();

  let spoilerDismissed = $state(false);
  let isSpoilered = $derived(spoilered && !spoilerDismissed);
  // A masked section is never finished, so it stays with the outstanding sections.
  const completionSection = registerCompletionSection(
    () => false,
    () => topLevel && isSpoilered,
  );
</script>

{#if !isSpoilered}
  {@render children()}
{:else if completionSection.visible}
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
