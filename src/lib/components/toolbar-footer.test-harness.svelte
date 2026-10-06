<script lang="ts">
  import { untrack } from "svelte";

  import ToolbarFooter from "#lib/components/toolbar-footer.svelte";
  import { pageMetadata } from "#lib/data/page-metadata.js";
  import { setFeedbackContext } from "#lib/feedback/context.svelte.js";

  import type { PageMetadataInput } from "#lib/data/page-metadata.js";
  import type { FeedbackContext } from "#lib/feedback/context.svelte.js";

  let {
    feedbackContext,
    metadata = { description: "Test page.", title: "Test" },
  }: { feedbackContext: FeedbackContext; metadata?: PageMetadataInput } = $props();

  let toolbarFooter = $state<{ isOverlayActive: () => boolean }>();
  let overlayActive = $derived(toolbarFooter?.isOverlayActive() ?? false);

  setFeedbackContext(untrack(() => feedbackContext));
</script>

<ToolbarFooter metadata={pageMetadata(metadata)} bind:this={toolbarFooter} />
<p data-testid="overlay-state">{overlayActive ? "active" : "inactive"}</p>
