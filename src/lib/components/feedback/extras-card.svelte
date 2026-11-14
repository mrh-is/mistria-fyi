<script lang="ts">
  import IconMail from "@tabler/icons-svelte-runes/icons/mail";
  import IconPaperclip from "@tabler/icons-svelte-runes/icons/paperclip";
  import IconRefresh from "@tabler/icons-svelte-runes/icons/refresh";

  import PeekSlip from "#lib/components/feedback/peek-slip.svelte";
  import VisibilityTag from "#lib/components/feedback/visibility-tag.svelte";
  import TagDialog from "#lib/components/tag-dialog.svelte";
  import * as Dialog from "#lib/components/ui/dialog/index.js";

  import type { Preview } from "#lib/components/feedback/preview-sheet.svelte";

  let {
    allowSyncLog,
    onPeek,
    open = $bindable(false),
  }: {
    allowSyncLog: boolean;
    /** Opens a preview over this card; nothing gets turned on. */
    onPeek: (preview: Preview) => void;
    open?: boolean;
  } = $props();
</script>

<TagDialog bind:open>
  <div class="extras-card__body">
    <div class="extras-card__heading">
      <Dialog.Title>What the extras send</Dialog.Title>
    </div>
    <Dialog.Description class="extras-card__lead"
      >Only what you switch on goes with your message. Peeking doesn’t count!</Dialog.Description
    >
    <dl class="extras-card__list">
      <div class="extras-card__entry">
        <dt>
          <IconPaperclip class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="extras-card__name"
            ><!-- @wc-context: feedback extra progress name -->Progress</span
          >
          <PeekSlip label="Peek at my progress" onclick={() => onPeek("progress")} />
          <VisibilityTag visibility="public" />
        </dt>
        <dd>What you’ve checked off & your skill levels, so we can see what you’re seeing.</dd>
      </div>
      {#if allowSyncLog}
        <div class="extras-card__entry">
          <dt>
            <IconRefresh class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="extras-card__name">Sync log</span>
            <PeekSlip label="Peek at my sync log" onclick={() => onPeek("syncLog")} />
            <VisibilityTag visibility="public" />
          </dt>
          <dd>
            Your recent save file syncs from this tab, for when syncing acts up. Names & sync links
            come out first.
          </dd>
        </div>
      {/if}
      <div class="extras-card__entry">
        <dt>
          <IconMail class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="extras-card__name">Reply</span>
          <VisibilityTag visibility="private" />
        </dt>
        <dd>
          We’ll ask for your email so Michael can write back. Nobody else sees it, and it never goes
          on the issue.
        </dd>
      </div>
    </dl>
  </div>
  <div class="extras-card__footer">
    <Dialog.Close class="inventory-tag__close">Got it</Dialog.Close>
  </div>
</TagDialog>

<style>
  .extras-card__body {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    overflow-y: auto;
    padding: 15px 16px 0;
  }

  .extras-card__heading {
    padding-bottom: 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-tag-ink) 42%, transparent);
  }

  .extras-card__body :global(.extras-card__lead) {
    padding-top: 8px;
    color: var(--color-tag-ink-muted);
    font-size: var(--text-sm);
  }

  .extras-card__list {
    display: grid;
    gap: 12px;
    margin: 0;
    padding-block: 12px;
    color: var(--color-tag-ink);
  }

  .extras-card__list dt {
    display: flex;
    min-height: 28px;
    align-items: center;
    gap: 6px;
  }

  .extras-card__name {
    flex: 1;
    font-family: var(--font-controls);
    font-size: var(--text-2xs);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .extras-card__list dd {
    margin: 2px 0 0 20px;
    font-size: var(--text-sm);
  }

  .extras-card__footer {
    display: flex;
    justify-content: flex-end;
    padding: 0 16px 14px;
  }
</style>
