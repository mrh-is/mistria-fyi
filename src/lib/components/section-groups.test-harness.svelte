<script lang="ts">
  import { untrack } from "svelte";

  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SectionGroups from "#lib/components/section-groups.svelte";
  import { createSectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import { setFeedbackContext } from "#lib/feedback/context.svelte.js";

  import type { SectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import type { FeedbackContext } from "#lib/feedback/context.svelte.js";

  interface HarnessSection {
    count: number;
    hidden?: boolean;
    id: string;
    total: number;
  }

  let {
    feedbackContext,
    onGrouping,
    sections,
  }: {
    feedbackContext: FeedbackContext;
    onGrouping?: (grouping: SectionGrouping<string>) => void;
    sections: HarnessSection[];
  } = $props();

  setFeedbackContext(untrack(() => feedbackContext));

  const grouping = createSectionGrouping<string>();
  untrack(() => onGrouping?.(grouping));
</script>

<SectionGroups getKey={(section) => section.id} {grouping} items={sections}>
  {#snippet section({ count, hidden, id, total })}
    {#if !hidden}
      <ExpandableSection locale="en" {count} name={id} {total}>
        <button type="button">Row in {id}</button>
      </ExpandableSection>
    {/if}
  {/snippet}
</SectionGroups>
