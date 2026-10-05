<script lang="ts">
  import IconX from "@tabler/icons-svelte-runes/icons/x";
  import { tick } from "svelte";

  import * as m from "#lib/paraglide/messages.js";

  import type { FeedbackContext } from "#lib/feedback/context.svelte.js";
  import type { ReportableElement } from "#lib/feedback/types.js";

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
    aria-label={m.feedback_picker_dialog_title()}
    aria-modal="true"
  >
    <button
      class="pointer-events-auto fixed inset-0 bg-black/45 motion-safe:transition-opacity"
      type="button"
      aria-label={m.feedback_picker_cancel_outside_aria()}
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
        aria-label={m.feedback_picker_report_about_aria({ name: highlight.metadata.displayName })}
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

    <div class="picker-header pointer-events-auto">
      <button
        bind:this={cancelButton}
        class="picker-header__back"
        type="button"
        aria-label={m.feedback_picker_cancel_aria()}
        onclick={() => {
          feedbackContext.cancel();
        }}
      >
        <IconX class="size-5" />
      </button>
      <p class="picker-header__title" aria-live="polite">{m.feedback_picker_dialog_title()}</p>
    </div>
  </div>
{/if}

<style>
  .picker-header {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    z-index: 50;
    display: flex;
    min-height: 62px;
    align-items: center;
    gap: 8px;
    padding: max(16px, env(safe-area-inset-top)) 16px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--hairline) 50%, transparent);
    background: var(--paper-raised);
    box-shadow: var(--shadow-small);
  }

  .picker-header__back {
    display: flex;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    margin-left: -12px;
    color: var(--ink-muted);
  }

  .picker-header__back:is(:hover, :focus-visible) {
    color: var(--ink);
    outline: 2px solid var(--primary);
    outline-offset: -6px;
  }

  .picker-header__title {
    flex: 1;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-style: var(--font-display-style);
    font-weight: 400;
    line-height: 1.15;
  }
</style>
