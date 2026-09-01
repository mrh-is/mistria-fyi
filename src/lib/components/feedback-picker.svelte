<script lang="ts">
  import { X } from "@lucide/svelte";
  import { tick } from "svelte";

  import type { FeedbackContext } from "$lib/feedback/context.svelte.js";
  import type { ReportableElement } from "$lib/feedback/types.js";

  interface Highlight {
    height: number;
    left: number;
    metadata: ReportableElement;
    top: number;
    width: number;
  }

  let { active, feedbackContext }: { active: boolean; feedbackContext: FeedbackContext } = $props();

  let cancelButton = $state<HTMLButtonElement | null>(null);
  let highlights = $state<Highlight[]>([]);
  let wasPicking = false;

  function updateHighlights(): void {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    highlights = [...feedbackContext.registrations.entries()].flatMap(([element, metadata]) => {
      if (!element.isConnected) return [];
      const rect = element.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const right = Math.min(viewportWidth, rect.right);
      const top = Math.max(0, rect.top);
      const bottom = Math.min(viewportHeight, rect.bottom);
      if (right <= left || bottom <= top) return [];

      return [{ height: bottom - top, left, metadata, top, width: right - left }];
    });
  }

  $effect(() => {
    if (!active) {
      highlights = [];
      wasPicking = false;
      return;
    }

    if (feedbackContext.registrations.size === 0) {
      highlights = [];
    } else {
      updateHighlights();
    }
    let frame = requestAnimationFrame(function refresh() {
      updateHighlights();
      frame = requestAnimationFrame(refresh);
    });

    if (!wasPicking) {
      wasPicking = true;
      void tick().then(() => cancelButton?.focus());
    }

    return () => {
      cancelAnimationFrame(frame);
    };
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (!active) return;

    if (event.key === "Escape") {
      event.preventDefault();
      feedbackContext.cancel();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = [
      cancelButton,
      ...document.querySelectorAll<HTMLButtonElement>("[data-feedback-picker-target]"),
    ].filter((element): element is HTMLButtonElement => element !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const currentIndex = focusable.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.shiftKey ? -1 : 1;
    const nextIndex =
      currentIndex < 0 ? 0 : (currentIndex + direction + focusable.length) % focusable.length;
    event.preventDefault();
    focusable[nextIndex]?.focus();
  }
</script>

<svelte:window onkeydown={handleKeydown} onresize={updateHighlights} onscroll={updateHighlights} />

{#if active}
  <div
    class="pointer-events-none fixed inset-0 z-40"
    role="dialog"
    aria-label="Pick an item to report"
    aria-modal="true"
  >
    <button
      class="pointer-events-auto fixed inset-0 bg-black/45 motion-safe:transition-opacity"
      type="button"
      aria-label="Cancel item picker by clicking outside"
      tabindex="-1"
      style="touch-action: pan-y"
      onclick={() => {
        feedbackContext.cancel();
      }}
    ></button>

    {#each highlights as highlight, index (`${highlight.metadata.entityId ?? highlight.metadata.displayName}-${index}`)}
      <button
        class="pointer-events-auto fixed rounded-md border-2 border-primary bg-primary/10 shadow-[0_0_0_2px_hsl(var(--background))] outline-none focus:border-primary-foreground focus:bg-primary/25 motion-safe:transition-[border-color,background-color]"
        type="button"
        aria-label={`Report feedback about ${highlight.metadata.displayName}`}
        data-feedback-picker-target
        style:left={`${highlight.left}px`}
        style:top={`${highlight.top}px`}
        style:width={`${highlight.width}px`}
        style:height={`${highlight.height}px`}
        onclick={() => {
          feedbackContext.select(highlight.metadata);
        }}
      ></button>
    {/each}

    <button
      bind:this={cancelButton}
      class="pointer-events-auto fixed top-safe-offset-3 right-3 flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium shadow-lg"
      type="button"
      onclick={() => {
        feedbackContext.cancel();
      }}
    >
      <X class="size-4" />
      Cancel
    </button>

    <p
      class="pointer-events-none fixed right-4 bottom-safe-offset-20 left-4 rounded-lg bg-background/95 p-3 text-center text-sm font-medium shadow-lg"
      aria-live="polite"
    >
      Pick the item you want to report
    </p>
  </div>
{/if}
