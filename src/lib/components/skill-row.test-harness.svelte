<script lang="ts">
  import { untrack } from "svelte";

  import SkillRow from "$lib/components/skill-row.svelte";
  import { setFeedbackContext } from "$lib/feedback/context.svelte.js";

  import type { FeedbackContext } from "$lib/feedback/context.svelte.js";
  import type { SkillId } from "$lib/types/tracker-data.js";

  let {
    feedbackContext,
    id,
    name,
  }: { feedbackContext: FeedbackContext; id: SkillId; name: string } = $props();

  setFeedbackContext(untrack(() => feedbackContext));
</script>

<SkillRow {id} {name} />
