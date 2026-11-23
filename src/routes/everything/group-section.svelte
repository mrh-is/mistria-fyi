<script lang="ts">
  import IconListDetails from "@tabler/icons-svelte-runes/icons/list-details";
  import { onMount, untrack } from "svelte";

  import { Icon } from "#lib/components/icon/index.js";
  import {
    getLedgerIndexContext,
    LEDGER_ARRIVAL_EVENT,
  } from "#lib/components/ledger/ledger-context.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";

  import type { Snippet } from "svelte";

  let {
    children,
    completed = false,
    count,
    description,
    findable = false,
    icon,
    id,
    name,
    placeGroup = false,
    revealTarget = "",
    visible = true,
  }: {
    children: Snippet;
    completed?: boolean;
    count?: Snippet;
    description?: string;
    findable?: boolean;
    icon: Snippet;
    id: string;
    name: string;
    placeGroup?: boolean;
    revealTarget?: string;
    visible?: boolean;
  } = $props();
  let open = $state(untrack(() => !completed));
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });
  // A search has to reach rows inside a closed group, as it does inside closed sections.
  let isOpen = $derived(open || Boolean(toolbarState.searchQuery));
  const instanceId = $props.id();
  // Without the index rail (phones & half screens), each group's head offers the jump list.
  const index = getLedgerIndexContext();
  let contentId = $derived(`group-${instanceId}`);
  $effect(() => {
    if (revealTarget) open = true;
  });

  // A repeated link to this group or a place inside it reopens the group the reader folded.
  function reopen(): void {
    open = true;
  }

  function listenForArrival(element: HTMLElement): () => void {
    element.addEventListener(LEDGER_ARRIVAL_EVENT, reopen);
    return () => {
      element.removeEventListener(LEDGER_ARRIVAL_EVENT, reopen);
    };
  }

  function measureHeading(heading: HTMLElement): (() => void) | undefined {
    const group = heading.parentElement;
    if (!placeGroup || !group) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize[0]?.blockSize;
      if (height !== undefined) group.style.setProperty("--ledger-group-head", `${height}px`);
    });
    observer.observe(heading);
    return () => observer.disconnect();
  }
</script>

<section aria-labelledby={id} hidden={!visible} {@attach listenForArrival}>
  <h2
    {id}
    tabindex="-1"
    data-ledger-index-heading
    class:place-group={placeGroup}
    class="sticky z-[var(--z-section-header)] flex scroll-mt-[var(--ledger-anchor-offset,8rem)] items-center bg-background"
    style="top: var(--section-header-sticky-top, 0px)"
    {@attach measureHeading}
  >
    <button
      type="button"
      class="flex min-h-11 w-full items-center gap-2 px-2 py-2 text-left text-sm font-semibold tracking-wide focus-visible:outline-2 focus-visible:outline-ring"
      data-section-trigger
      aria-label={name}
      aria-describedby={description ? `${contentId}-description` : undefined}
      disabled={!hydrated}
      aria-busy={!hydrated}
      aria-expanded={isOpen}
      aria-controls={contentId}
      onclick={() => {
        open = !open;
      }}
    >
      <Icon.UI
        type="disclosure"
        class="size-4 shrink-0 transition-transform motion-reduce:transition-none {isOpen
          ? 'rotate-90'
          : ''}"
      />
      {@render icon()}
      <span class="group-name flex-1">{name}</span>
      {#if count}{@render count()}{/if}
    </button>
    {#if index?.jumpList}
      <button
        type="button"
        class="grid size-11 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
        popovertarget={index.jumpList}
        aria-label="Jump to a section"
      >
        <IconListDetails class="size-4" />
      </button>
    {/if}
  </h2>
  {#if description}<span id="{contentId}-description" class="sr-only">{description}</span>{/if}
  <div
    id={contentId}
    hidden={isOpen ? undefined : findable ? "until-found" : true}
    onbeforematch={() => (open = true)}
    class="flex flex-col gap-1"
  >
    {@render children()}
  </div>
</section>

<style>
  .place-group {
    border-block-end: 1px solid var(--color-ink-hairline);
    background: var(--color-paper);
  }

  .place-group .group-name {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 400;
    letter-spacing: normal;
    line-height: 1.15;
  }

  h2[data-ledger-index-heading]:focus-visible {
    outline: none;
    text-decoration: underline;
    text-decoration-color: var(--color-guide-voice);
    text-underline-offset: 0.25em;
  }
</style>
