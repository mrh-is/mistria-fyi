<script lang="ts">
  import ExpandableSection from "#lib/components/expandable-section.svelte";

  import type { FeedbackContext } from "#lib/feedback/context.svelte.js";
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
    reportCategory?: string;
    reportEntityId?: string;
    reportExtra?: Record<string, number | string>;
    total?: number;
  } = $props();
</script>

<ExpandableSection
  {locale}
  {count}
  {defaultOpen}
  {depth}
  {feedbackContext}
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
