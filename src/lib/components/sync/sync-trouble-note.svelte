<script lang="ts">
  import IconAlertTriangle from "@tabler/icons-svelte-runes/icons/alert-triangle";

  import { Button } from "#lib/components/ui/button/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { syncReceiver } from "#lib/sync/receiver-state.svelte.js";
  import { stopSyncing } from "#lib/sync/sharing.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import SyncTagDialog from "./sync-tag-dialog.svelte";

  const status = $derived(syncReceiver.status);
  // A question on screen speaks for itself; this is what's left once the player cancels it.
  const waiting = $derived(status.kind === "asking" && !syncReceiver.question);

  const copy = $derived.by((): undefined | { body?: string; title: string } => {
    switch (status.kind) {
      case "asking":
        return waiting ? { title: m.sync_question_waiting() } : undefined;
      case "blocked":
        return { title: m.sync_blocked() };
      case "retired":
        return { body: m.sync_retired_body(), title: m.sync_retired_title() };
      case "switch-failed":
        return { body: m.sync_switch_failed_body(), title: m.sync_switch_failed_title() };
      case "unreadable":
        return { body: m.sync_unreadable_away_body(), title: m.sync_unreadable_away_title() };
      case "update-computer":
        return { title: m.sync_update_computer() };
      case "update-here":
        return { title: m.sync_update_here() };
      case "write-failed":
        return { body: m.sync_write_failed_body(), title: m.sync_write_failed_title() };
      default:
        return undefined;
    }
  });

  let stopOpen = $state(false);

  async function confirmStop(): Promise<void> {
    stopOpen = false;
    await stopSyncing();
  }
</script>

{#if copy}
  <aside class="sync-trouble" role="status">
    <span class="sync-trouble__tape" aria-hidden="true"></span>
    <IconAlertTriangle class="sync-trouble__icon" aria-hidden="true" />
    <div>
      <p class="sync-trouble__title">{copy.title}</p>
      {#if copy.body}<p>{copy.body}</p>{/if}
      {#if status.kind === "retired"}
        <div class="sync-trouble__actions">
          <Button size="sm" href={localizedHref("sync")}>{m.sync_retired_action()}</Button>
          <Button
            size="sm"
            variant="outline"
            onclick={() => {
              stopOpen = true;
            }}
          >
            {m.sync_retired_stop()}
          </Button>
        </div>
      {:else if status.kind === "blocked"}
        <div class="sync-trouble__actions">
          <Button size="sm" href={localizedHref("data")}>{m.sync_panel_settings()}</Button>
        </div>
      {:else if status.kind === "update-here"}
        <div class="sync-trouble__actions">
          <Button
            size="sm"
            onclick={() => {
              globalThis.location.reload();
            }}
          >
            {m.sync_update_refresh()}
          </Button>
        </div>
      {:else if status.kind === "write-failed"}
        <div class="sync-trouble__actions">
          <Button
            size="sm"
            onclick={() => {
              syncReceiver.refresh();
            }}
          >
            {m.sync_try_again()}
          </Button>
        </div>
      {:else if waiting}
        <div class="sync-trouble__actions">
          <Button
            size="sm"
            onclick={() => {
              syncReceiver.reopenQuestion();
            }}
          >
            {m.sync_question_open()}
          </Button>
        </div>
      {/if}
    </div>
  </aside>
{/if}

<SyncTagDialog
  bind:open={stopOpen}
  title={m.sync_stop_title()}
  body={m.sync_stop_body()}
  actions={[
    {
      label: m.sync_stop_cancel(),
      onclick: () => {
        stopOpen = false;
      },
    },
    { label: m.sync_stop_confirm(), onclick: () => void confirmStop(), primary: true },
  ]}
/>

<style>
  .sync-trouble {
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

  .sync-trouble__tape {
    position: absolute;
    top: -7px;
    left: 18px;
    width: 46px;
    height: 13px;
    background: color-mix(in srgb, var(--color-status-warning) 30%, var(--color-paper));
    transform: rotate(-2deg);
  }

  .sync-trouble :global(.sync-trouble__icon) {
    width: 16px;
    height: 16px;
    flex: none;
    margin-top: 2px;
    color: var(--color-status-warning);
  }

  .sync-trouble__title {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .sync-trouble__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
</style>
