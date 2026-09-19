<script lang="ts">
  import { untrack } from "svelte";

  import ToolbarFooter from "$lib/components/toolbar-footer.svelte";
  import { pageMetadata } from "$lib/data/page-metadata.js";
  import { setFeedbackContext } from "$lib/feedback/context.svelte.js";

  import type { PageMetadataInput } from "$lib/data/page-metadata.js";
  import type { FeedbackContext } from "$lib/feedback/context.svelte.js";

  let {
    feedbackContext,
    metadata = { description: "Test page.", title: "Test" },
  }: { feedbackContext: FeedbackContext; metadata?: PageMetadataInput } = $props();

  let overlayActive = $state(false);

  setFeedbackContext(untrack(() => feedbackContext));
</script>

<ToolbarFooter metadata={pageMetadata(metadata)} bind:overlayActive />
<p data-testid="overlay-state">{overlayActive ? "active" : "inactive"}</p>
