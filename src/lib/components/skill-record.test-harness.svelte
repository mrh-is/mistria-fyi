<script lang="ts">
  import { untrack } from "svelte";

  import SkillRecord from "#lib/components/skill-record.svelte";
  import { setFeedbackContext } from "#lib/feedback/context.svelte.js";

  import type { FeedbackContext } from "#lib/feedback/context.svelte.js";
  import type { SkillId } from "#lib/types/tracker-data.js";

  let {
    compact = false,
    feedbackContext,
    id,
    name,
  }: { compact?: boolean; feedbackContext: FeedbackContext; id: SkillId; name: string } = $props();

  setFeedbackContext(untrack(() => feedbackContext));
</script>

<ul>
  <SkillRecord {compact} {id} {name} />
</ul>
