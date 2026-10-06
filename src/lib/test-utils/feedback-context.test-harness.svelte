<script lang="ts">
  import { untrack } from "svelte";

  import { setFeedbackContext } from "#lib/feedback/context.svelte.js";

  import type { Component } from "svelte";

  import type { FeedbackContext } from "#lib/feedback/context.svelte.js";

  /** Provides the feedback context the app's root layout supplies, around any component. */
  let {
    component: Inner,
    feedbackContext,
    innerProps,
  }: {
    component: Component<Record<string, unknown>>;
    feedbackContext: FeedbackContext;
    innerProps: Record<string, unknown>;
  } = $props();

  setFeedbackContext(untrack(() => feedbackContext));
</script>

<Inner {...innerProps} />
