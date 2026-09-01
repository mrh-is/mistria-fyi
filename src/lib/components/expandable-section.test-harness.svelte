<script lang="ts">
  import ExpandableSection from "$lib/components/expandable-section.svelte";

  import type { FeedbackContext } from "$lib/feedback/context.svelte.js";

  let {
    feedbackContext,
    name = "Test Section",
    reportCategory,
    reportEntityId,
    reportExtra,
  }: {
    feedbackContext: FeedbackContext;
    name?: string;
    reportCategory?: string;
    reportEntityId?: string;
    reportExtra?: Record<string, number | string>;
  } = $props();
</script>

<ExpandableSection {feedbackContext} {name} {reportCategory} {reportEntityId} {reportExtra}>
  <p>Test content</p>
</ExpandableSection>
