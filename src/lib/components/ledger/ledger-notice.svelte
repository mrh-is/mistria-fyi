<script lang="ts">
  let { changed, onRefresh }: { changed: boolean; onRefresh: () => void } = $props();
</script>

<div class="ledger-notice" aria-live="polite">
  {#if changed}
    <span>Your progress or the day changed.</span>
    <button type="button" onclick={onRefresh}>Refresh shelves</button>
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
