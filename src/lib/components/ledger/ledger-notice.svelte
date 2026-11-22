<script lang="ts">
  import { tick } from "svelte";

  let { changed, onRefresh }: { changed: boolean; onRefresh: () => void } = $props();

  /** The heading of the section the reader is in: the last one to start above a third down. */
  function readingHeading(): HTMLElement | undefined {
    const headings = document.querySelectorAll<HTMLElement>(
      "[data-ledger-content]:not([inert] *) [data-ledger-section] h3[tabindex='-1']",
    );
    const line = globalThis.innerHeight / 3;
    let found: HTMLElement | undefined;
    for (const heading of headings) {
      if (!heading.checkVisibility()) continue;
      const section = heading.closest("section") ?? heading;
      if (section.getBoundingClientRect().top > line) return found ?? heading;
      found = heading;
    }
    return found;
  }

  /*
   * The button leaves with the notice, so hand focus to the section the reader is in. Moving it
   * first lets a page's own focus fallback keep it there if the refresh moves that section.
   */
  async function refresh(event: MouseEvent): Promise<void> {
    const focused = event.currentTarget === document.activeElement;
    if (focused) readingHeading()?.focus({ preventScroll: true });
    onRefresh();
    if (!focused) return;
    await tick();
    if (document.activeElement === document.body) {
      const target =
        readingHeading() ?? document.querySelector<HTMLElement>("[data-toolbar-search] input");
      target?.focus({ preventScroll: true });
    }
  }
</script>

<!-- The ledger index measures this, so sticky heads & the rail sit below it while it shows. -->
<div class="ledger-notice" data-ledger-notice aria-live="polite">
  {#if changed}
    <span>Your progress or the day changed.</span>
    <button type="button" onclick={(event) => void refresh(event)}>Refresh shelves</button>
  {/if}
</div>

<style>
  .ledger-notice:not(:empty) {
    position: sticky;
    top: var(--ledger-header-height, 3.25rem);
    z-index: calc(var(--z-page-header) + 1);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    padding-inline: 0.75rem;
    border-block-end: 1px solid var(--color-ink-hairline);
    background: var(--color-paper-raised);
    font-size: var(--text-sm);
  }

  button {
    min-block-size: 44px;
    color: var(--color-guide-voice);
    text-decoration: underline;
  }
</style>
