<script lang="ts">
  import { untrack } from "svelte";

  import ToolbarFooter from "$lib/components/toolbar-footer.svelte";
  import { setFeedbackContext } from "$lib/feedback/context.svelte.js";

  import type { FeedbackContext } from "$lib/feedback/context.svelte.js";

  let { feedbackContext, hidden = false }: { feedbackContext: FeedbackContext; hidden?: boolean } =
    $props();

  let overlayActive = $state(false);

  setFeedbackContext(untrack(() => feedbackContext));
</script>

<ToolbarFooter {hidden} bind:overlayActive />
<p data-testid="overlay-state">{overlayActive ? "active" : "inactive"}</p>
