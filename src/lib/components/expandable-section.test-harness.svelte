<script lang="ts">
  import { untrack } from "svelte";

  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import { alwaysToDo } from "#lib/engine/shelves.js";
  import { setFeedbackContext } from "#lib/feedback/context.svelte.js";

  import type { FeedbackContext } from "#lib/feedback/context.svelte.js";
  import type { ReportCategory } from "#lib/feedback/types.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  let {
    count,
    defaultOpen = false,
    depth = 0,
    feedbackContext,
    forceOpen = false,
    locale = "en",
    name = "Test Section",
    reportCategory,
    reportEntityId,
    reportExtra,
    total,
  }: {
    count?: number;
    defaultOpen?: boolean;
    depth?: number;
    feedbackContext: FeedbackContext;
    forceOpen?: boolean;
    locale?: LocaleCode;
    name?: string;
    reportCategory?: ReportCategory;
    reportEntityId?: string;
    reportExtra?: Record<string, number | string>;
    total?: number;
  } = $props();

  setFeedbackContext(untrack(() => feedbackContext));
</script>

<ExpandableSection
  {locale}
  {defaultOpen}
  {depth}
  {forceOpen}
  {name}
  progress={total === undefined ? undefined : alwaysToDo(count ?? 0, total)}
  {reportCategory}
  {reportEntityId}
  {reportExtra}
>
  <p>Test content</p>
</ExpandableSection>
