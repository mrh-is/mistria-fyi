<script lang="ts">
  import { untrack } from "svelte";

  import { Icon } from "#lib/components/icon/index.js";
  import SectionTrigger from "#lib/components/section-trigger.svelte";
  import Spoiler from "#lib/components/spoiler.svelte";
  import {
    getSharedReveals,
    registerCompletionSection,
  } from "#lib/controllers/completion-scope.svelte.js";
  import { getSectionGroupItem } from "#lib/controllers/section-grouping.svelte.js";

  import type { Snippet } from "svelte";

  import type { Shelf } from "#lib/engine/shelves.js";

  let {
    children,
    maskedShelf = "notNow",
    name,
    spoilered,
    topLevel = false,
  }: {
    children: Snippet;
    /** The shelf the section's own rows put it on, which a mask must not change. */
    maskedShelf?: Shelf;
    name: string;
    spoilered: boolean;
    /** Stands in for a top-level section, which Everything partitions by completion. */
    topLevel?: boolean;
  } = $props();

  const sharedReveals = getSharedReveals();
  let spoilerDismissed = $state(false);
  let isSpoilered = $derived(
    spoilered && !spoilerDismissed && !(topLevel && sharedReveals?.has(name)),
  );
  // A masked section is never finished, so it stays with the outstanding sections.
  const completionSection = registerCompletionSection(
    () => false,
    () => topLevel && isSpoilered,
  );

  // Once revealed, the section's own header reports its shelf.
  const sectionGroupItem = getSectionGroupItem();
  $effect(() => {
    if (!topLevel || !isSpoilered || !sectionGroupItem) return;
    const { report } = sectionGroupItem;
    const shelf = maskedShelf;
    untrack(() => {
      report(shelf);
    });
    return () => {
      untrack(() => {
        report(undefined);
      });
    };
  });
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
        <Spoiler
          onReveal={() => {
            spoilerDismissed = true;
            if (topLevel) sharedReveals?.add(name);
          }}>{name}</Spoiler
        >
      </span>
    </SectionTrigger>
  </div>
{/if}
