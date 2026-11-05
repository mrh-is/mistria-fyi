<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { slide } from "svelte/transition";

  import { Icon } from "#lib/components/icon/index.js";
  import SectionTrigger from "#lib/components/section-trigger.svelte";
  import { registerCompletionSection } from "#lib/controllers/completion-scope.svelte.js";
  import { getSectionGroupItem } from "#lib/controllers/section-grouping.svelte.js";
  import { progressShelf } from "#lib/engine/shelves.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { page } from "$app/state";

  import type { Snippet } from "svelte";

  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { ReportCategory } from "#lib/feedback/types.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  const feedbackContext = getFeedbackContext();
  const sectionGroupItem = getSectionGroupItem();

  let {
    children,
    defaultOpen = false,
    depth = 0,
    forceOpen = false,
    locale,
    name,
    progress,
    reportCategory,
    reportEntityId,
    reportExtra,
  }: {
    children: Snippet;
    defaultOpen?: boolean;
    depth?: number;
    forceOpen?: boolean;
    locale: LocaleCode;
    name: string;
    progress?: CategoryProgress;
    reportCategory?: ReportCategory;
    reportEntityId?: string;
    reportExtra?: Record<string, number | string>;
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
  let total = $derived(progress?.total);
  let boundedCount = $derived(
    progress === undefined ? undefined : Math.min(Math.max(progress.completed, 0), progress.total),
  );
  let percent = $derived(
    progress !== undefined && progress.total > 0 && boundedCount !== undefined
      ? (boundedCount / progress.total) * 100
      : 0,
  );
  let todoPercent = $derived(
    progress !== undefined && progress.total > 0 ? (progress.todo / progress.total) * 100 : 0,
  );
  let shelf = $derived(progress === undefined ? undefined : progressShelf(progress));
  // A section with progress & no shelf has nothing the filters show, so it leaves the page.
  let leavesPage = $derived(progress !== undefined && shelf === undefined);
  // Derived apart from `progress`, whose object can change while the shelf doesn't.
  let reportedShelf = $derived(progress === undefined ? "todo" : shelf);
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
    const current = reportedShelf;
    // Reporting writes the grouping's state; reading it here would re-run this effect forever.
    untrack(() => {
      report(current);
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
  hidden={!completionSection.visible || leavesPage}
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
      <span class="section-name" class:section-name--waiting={shelf === "notNow"}>{name}</span>
      {#if total !== undefined && boundedCount !== undefined}
        <span class="section-count" aria-hidden="true">
          {formatNumber(boundedCount, locale)} / {formatNumber(total, locale)}
        </span>
        <span class="section-progress" data-testid="section-progress" aria-hidden="true">
          <i data-testid="section-progress-fill" style="width: {percent}%"></i>
          <b data-testid="section-progress-todo" style="width: {todoPercent}%"></b>
        </span>
      {/if}
    </SectionTrigger>
  </svelte:element>

  {#if isOpen && completionSection.visible && !leavesPage}
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

  .section-name--waiting {
    color: var(--color-ink-muted);
    font-weight: 400;
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
    display: flex;
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

  /* The To do share: a quiet tint, because the shelf already says something's doable. */
  .section-progress b {
    display: block;
    height: 100%;
    background: color-mix(in srgb, var(--primary) 34%, transparent);
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
    .section-progress i,
    .section-progress b {
      transition-duration: 0.01ms;
    }
  }
</style>
