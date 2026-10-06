<script lang="ts">
  import RenownCurrentRecord from "#lib/components/renown-current-record.svelte";
  import { FeedbackContext, setFeedbackContext } from "#lib/feedback/context.svelte.js";

  let { compact = false }: { compact?: boolean } = $props();

  setFeedbackContext(new FeedbackContext());
</script>

<RenownCurrentRecord {compact} locale="en" />
