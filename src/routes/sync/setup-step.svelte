<script lang="ts">
  import IconCircleCheck from "@tabler/icons-svelte-runes/icons/circle-check";

  import type { Snippet } from "svelte";

  let {
    children,
    footer,
    numeral,
    state,
    summary,
    title,
    titleRef = $bindable(),
  }: {
    children?: Snippet;
    footer?: Snippet;
    /** Lowercase roman numeral: i, ii, iii. */
    numeral: string;
    state: "active" | "done" | "pending";
    /** A done step's one-line summary, e.g. the save file's name. */
    summary?: string;
    title: string;
    titleRef?: HTMLElement;
  } = $props();
</script>

<section class="step step--{state}">
  <header class="step__header">
    <span class="step__numeral" aria-hidden="true">{numeral}.</span>
    <div class="step__heading">
      <h2 bind:this={titleRef} tabindex="-1">{title}</h2>
      {#if state === "done" && summary}
        <p class="step__summary">{summary}</p>
      {/if}
    </div>
    {#if state === "done"}
      <IconCircleCheck class="step__check" aria-hidden="true" />
    {/if}
  </header>
  {#if state === "active" && children}
    <div class="step__body">{@render children()}</div>
  {/if}
  {#if state === "active" && footer}
    <footer class="step__footer">{@render footer()}</footer>
  {/if}
</section>

<style>
  /* Steps are cards numbered in lowercase roman numerals, like a field manual's procedure. */
  .step {
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
    border-left: 3px solid color-mix(in srgb, var(--color-ink-hairline) 40%, transparent);
    background: var(--color-paper-raised);
  }

  .step--active {
    border-left-color: var(--color-home-accent);
    box-shadow: var(--shadow-small);
  }

  .step--done {
    border-left-color: var(--color-status-success);
  }

  .step__header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
  }

  .step__numeral {
    width: 1.8em;
    flex: none;
    color: var(--color-home-accent);
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-style: italic;
    line-height: 1;
  }

  .step--pending .step__numeral,
  .step--pending h2 {
    opacity: 0.7;
  }

  .step--done .step__numeral {
    color: var(--color-status-success);
  }

  .step__heading {
    min-width: 0;
    flex: 1;
  }

  .step h2 {
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 600;
    line-height: 1.25;
  }

  .step h2:focus {
    outline: none;
  }

  .step__summary {
    overflow: hidden;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step :global(.step__check) {
    width: 18px;
    height: 18px;
    flex: none;
    color: var(--color-status-success);
  }

  .step__body {
    padding: 0 12px 14px;
  }

  .step__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 10px 12px;
    border-top: 1px dashed color-mix(in srgb, var(--color-ink-hairline) 40%, transparent);
  }
</style>
