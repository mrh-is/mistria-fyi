<script lang="ts">
  import { untrack } from "svelte";

  import ExpandableSection from "#lib/components/expandable-section.svelte";
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
    onExpandedChange,
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
    onExpandedChange?: (expanded: boolean) => void;
    reportCategory?: ReportCategory;
    reportEntityId?: string;
    reportExtra?: Record<string, number | string>;
    total?: number;
  } = $props();

  setFeedbackContext(untrack(() => feedbackContext));
</script>

<ExpandableSection
  {locale}
  {count}
  {defaultOpen}
  {depth}
  {forceOpen}
  {name}
  {onExpandedChange}
  {reportCategory}
  {reportEntityId}
  {reportExtra}
  {total}
>
  <p>Test content</p>
</ExpandableSection>
