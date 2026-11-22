<script lang="ts">
  import { untrack } from "svelte";

  import SkillRecord from "#lib/components/skill-record.svelte";
  import { setFeedbackContext } from "#lib/feedback/context.svelte.js";

  import type { FeedbackContext } from "#lib/feedback/context.svelte.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { SkillId } from "#lib/types/tracker-data.js";

  let {
    feedbackContext,
    id,
    locale = "en",
    name,
  }: {
    feedbackContext: FeedbackContext;
    id: SkillId;
    locale?: LocaleCode;
    name: string;
  } = $props();

  setFeedbackContext(untrack(() => feedbackContext));
</script>

<ul>
  <SkillRecord {id} {locale} {name} />
</ul>
