<script lang="ts">
  import IconAlertTriangle from "@tabler/icons-svelte-runes/icons/alert-triangle";

  import type { Snippet } from "svelte";

  let {
    children,
    title,
    tone = "warning",
  }: {
    children?: Snippet;
    title: string;
    /** `error` for what can't be read, `warning` for what needs a look, `quiet` for news. */
    tone?: "error" | "quiet" | "warning";
  } = $props();
</script>

<aside class="sync-note sync-note--{tone}" role="status">
  <span class="sync-note__tape" aria-hidden="true"></span>
  {#if tone !== "quiet"}
    <IconAlertTriangle class="sync-note__icon" aria-hidden="true" />
  {/if}
  <div class="sync-note__body">
    <p class="sync-note__title">{title}</p>
    {@render children?.()}
  </div>
</aside>

<style>
  .sync-note {
    --sync-note-color: var(--color-status-warning);

    position: relative;
    display: flex;
    gap: 9px;
    padding: 16px 14px 13px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
    background: var(--color-paper-raised);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .sync-note--error {
    --sync-note-color: var(--destructive);
  }

  .sync-note--quiet {
    --sync-note-color: var(--color-ink-hairline);
  }

  .sync-note__tape {
    position: absolute;
    top: -7px;
    left: 18px;
    width: 46px;
    height: 13px;
    background: color-mix(in srgb, var(--sync-note-color) 30%, var(--color-paper));
    transform: rotate(-2deg);
  }

  .sync-note :global(.sync-note__icon) {
    width: 16px;
    height: 16px;
    flex: none;
    margin-top: 2px;
    color: var(--sync-note-color);
  }

  .sync-note__body {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 8px;
  }

  .sync-note__title {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
  }
</style>
