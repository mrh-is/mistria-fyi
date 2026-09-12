<script lang="ts">
  import ExpandableSection from "$lib/components/expandable-section.svelte";

  import type { FeedbackContext } from "$lib/feedback/context.svelte.js";

  let {
    count,
    defaultOpen = false,
    depth = 0,
    feedbackContext,
    forceOpen = false,
    name = "Test Section",
    reportCategory,
    reportEntityId,
    reportExtra,
    total,
  }: {
    count?: number;
    defaultOpen?: boolean;
    depth?: number;
    feedbackContext: FeedbackContext;
    forceOpen?: boolean;
    name?: string;
    reportCategory?: string;
    reportEntityId?: string;
    reportExtra?: Record<string, number | string>;
    total?: number;
  } = $props();
</script>

<ExpandableSection
  {count}
  {defaultOpen}
  {depth}
  {feedbackContext}
  {forceOpen}
  {name}
  {reportCategory}
  {reportEntityId}
  {reportExtra}
  {total}
>
  <p>Test content</p>
</ExpandableSection>
