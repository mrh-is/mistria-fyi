<script lang="ts">
  import { untrack } from "svelte";

  import BookShell from "#lib/components/book/book-shell.svelte";
  import ToolbarFooter from "#lib/components/toolbar-footer.svelte";
  import { pageMetadata } from "#lib/data/page-metadata.js";
  import { setFeedbackContext } from "#lib/feedback/context.svelte.js";

  import type { PageMetadataInput } from "#lib/data/page-metadata.js";
  import type { FeedbackContext } from "#lib/feedback/context.svelte.js";

  let {
    feedbackContext,
    metadata = { description: "Test page.", title: "Test" },
  }: { feedbackContext: FeedbackContext; metadata?: PageMetadataInput } = $props();

  setFeedbackContext(untrack(() => feedbackContext));
</script>

<!-- The toolbar renders in the book shell, which owns its panels & holds Send a note & Settings on the rail at book widths. -->
<BookShell hasToolbar={metadata.toolbar !== "hidden"}>
  {#snippet tools()}
    <ToolbarFooter metadata={pageMetadata(metadata)} />
  {/snippet}
  <p data-testid="page-content">Page</p>
</BookShell>
