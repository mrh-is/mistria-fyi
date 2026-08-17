<script lang="ts">
  import { slide } from "svelte/transition";

  import { Icon } from "$lib/components/icon/index.js";
  import ItemDetail from "$lib/components/item-detail.svelte";

  import type { AcquisitionSource } from "$lib/types/tracker-data.js";

  let {
    completed,
    dimmed = false,
    hideFishSize: _hideFishSize = false,
    leaving = false,
    name,
    onToggle,
    sources = [],
  }: {
    completed: boolean;
    dimmed?: boolean;
    hideFishSize?: boolean;
    leaving?: boolean;
    name: string;
    onToggle: () => void;
    sources?: AcquisitionSource[];
  } = $props();

  // Linger then fade+collapse when leaving due to completion.
  // For other removals (search filtering, bulk hide) exit instantly.
  function completeOut(node: Element) {
    // Read from DOM attribute — captures the value at last render, before reactive
    // props update in the same batch that removes this element from the {#each}.
    if (node.getAttribute("data-leaving") !== "true") return { duration: 0 };
    return {
      css: (t: number) => `opacity: ${t}; pointer-events: none;`,
      delay: 800,
      duration: 200,
      tick: (t: number) => {
        // Once fully faded, collapse the height instantly so there's no reflow pop.
        if (t === 0) {
          (node as HTMLElement).style.height = "0";
          (node as HTMLElement).style.overflow = "hidden";
        }
      },
    };
  }

  let expanded = $state(false);
</script>

<div out:completeOut data-leaving={leaving}>
  <div
    class="flex items-center gap-0 rounded-md pr-2 transition-opacity duration-200 {dimmed
      ? 'opacity-50'
      : ''} {completed || leaving ? 'line-through opacity-40' : ''}"
  >
    <button
      class="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
      type="button"
      aria-label={completed ? `Uncheck ${name}` : `Check ${name}`}
      onclick={onToggle}
    >
      <Icon.Completion
        state={completed ? "completed" : "none"}
        class="size-5 {completed
          ? 'text-green-600 dark:text-green-400'
          : 'text-muted-foreground/50'}"
      />
    </button>
    {#if sources.length > 0}
      <button
        class="group inline-flex min-w-0 flex-1 items-start gap-0.5 text-left"
        type="button"
        aria-expanded={expanded}
        aria-label="{name} details"
        onclick={() => {
          expanded = !expanded;
        }}
      >
        <span class="text-base group-hover:underline">{name}</span>
        <Icon.UI
          type="disclosure"
          class="mt-1.5 size-3 shrink-0 text-muted-foreground opacity-40 transition-all group-hover:opacity-60 {expanded
            ? 'rotate-90'
            : ''}"
        />
      </button>
    {:else}
      <span class="min-w-0 flex-1 text-base">{name}</span>
    {/if}
  </div>
  {#if expanded && sources.length > 0}
    <div transition:slide={{ duration: 150 }}>
      <ItemDetail {sources} />
    </div>
  {/if}
</div>
