<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { slide } from "svelte/transition";

  import { Icon } from "#lib/components/icon/index.js";
  import SectionTrigger from "#lib/components/section-trigger.svelte";
  import { registerCompletionSection } from "#lib/controllers/completion-scope.svelte.js";
  import { getSectionGroupItem } from "#lib/controllers/section-grouping.svelte.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { Snippet } from "svelte";

  import type { ReportCategory } from "#lib/feedback/types.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  const feedbackContext = getFeedbackContext();
  const sectionGroupItem = getSectionGroupItem();

  let {
    children,
    count,
    defaultOpen = false,
    depth = 0,
    forceOpen = false,
    locale,
    name,
    reportCategory,
    reportEntityId,
    reportExtra,
    total,
  }: {
    children: Snippet;
    count?: number;
    defaultOpen?: boolean;
    depth?: number;
    forceOpen?: boolean;
    locale: LocaleCode;
    name: string;
    reportCategory?: ReportCategory;
    reportEntityId?: string;
    reportExtra?: Record<string, number | string>;
    total?: number;
  } = $props();
  let reportable = $derived(
    reportCategory
      ? feedbackContext.reportableAttachment({
          category: reportCategory,
          displayName: name,
          entityId: reportEntityId,
          extra: reportExtra,
          page: page.url.pathname,
        })
      : undefined,
  );

  let headingTag = $derived<"h2" | "h3">(depth === 0 ? "h2" : "h3");

  let expanded = $state(untrack(() => defaultOpen));
  let hydrated = $state(false);
  let isOpen = $derived(expanded || forceOpen);
  let boundedCount = $derived(
    total === undefined || count === undefined ? undefined : Math.min(Math.max(count, 0), total),
  );
  let progress = $derived(
    total !== undefined && total > 0 && boundedCount !== undefined
      ? Math.min(100, Math.max(0, (boundedCount / total) * 100))
      : 0,
  );
  // A filter that leaves nothing in scope is not a finished section.
  let complete = $derived(total !== undefined && total > 0 && boundedCount === total);
  const completionSection = registerCompletionSection(
    () => complete,
    () => depth === 0,
  );
  let instanceId = $props.id();
  let contentId = $derived(
    `expandable-${instanceId}-${name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "")}`,
  );

  onMount(() => {
    hydrated = true;
  });

  // The top-level section groups by the same counts its header shows.
  $effect(() => {
    if (depth !== 0 || !sectionGroupItem) return;
    const { report } = sectionGroupItem;
    const reportedComplete = complete;
    // Reporting writes the grouping's state; reading it here would re-run this effect forever.
    untrack(() => {
      report(reportedComplete);
    });
    return () => {
      untrack(() => {
        report(undefined);
      });
    };
  });

  function toggleExpanded(): void {
    expanded = !expanded;
  }
</script>

<div
  class="section"
  hidden={!completionSection.visible}
  data-tracker-section
  data-section-depth={depth}
  style="--section-depth: {depth}"
>
  <svelte:element this={headingTag} class="section-heading">
    <SectionTrigger
      disabled={!hydrated}
      onclick={toggleExpanded}
      type="button"
      aria-busy={!hydrated}
      aria-expanded={isOpen}
      aria-controls={contentId}
      aria-label={total !== undefined && boundedCount !== undefined
        ? m.section_progress_label({
            completed: formatNumber(boundedCount, locale),
            name,
            total: formatNumber(total, locale),
          })
        : undefined}
      {@attach reportable}
    >
      <Icon.UI
        type="disclosure"
        class="section-disclosure size-4 shrink-0 transition-transform motion-reduce:transition-none {isOpen
          ? 'rotate-90'
          : ''}"
      />
      <span class="section-name">{name}</span>
      {#if total !== undefined && boundedCount !== undefined}
        <span class="section-count" aria-hidden="true"
          >{formatNumber(boundedCount, locale)} / {formatNumber(total, locale)}</span
        >
        <span class="section-progress" data-testid="section-progress" aria-hidden="true">
          <i data-testid="section-progress-fill" style="width: {progress}%"></i>
        </span>
      {/if}
    </SectionTrigger>
  </svelte:element>

  {#if isOpen && completionSection.visible}
    <div
      id={contentId}
      class="section-content"
      transition:slide={{ duration: prefersReducedMotion.current ? 0 : 150 }}
    >
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .section {
    --section-indent: calc(18px + var(--section-depth) * 4px);
    min-width: 0;
  }

  .section-heading {
    margin: 0;
    font: inherit;
  }

  .section-name {
    margin: 0;
    overflow: hidden;
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 600;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section-count {
    min-width: 9ch;
    color: var(--color-ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    text-align: right;
    white-space: nowrap;
  }

  .section-progress {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 2px;
    overflow: hidden;
    background: color-mix(in srgb, var(--primary) 13%, transparent);
  }

  .section-progress i {
    display: block;
    height: 100%;
    background: var(--primary);
    transition: width 300ms ease-out;
  }

  .section-content {
    min-width: 0;
    padding-inline-start: var(--section-indent);
    padding-block-start: 4px;
  }

  .section[data-section-depth]:not([data-section-depth="0"]) .section-progress {
    opacity: 0.72;
  }

  @media (prefers-reduced-motion: reduce) {
    .section-progress i {
      transition-duration: 0.01ms;
    }
  }
</style>
