<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncReceiver } from "#lib/sync/receiver-state.svelte.js";
  import { stopSyncing } from "#lib/sync/sharing.js";
  import { localizedHref } from "#lib/utils/localized-href.js";

  import CourierNote from "./courier-note.svelte";
  import SyncNote from "./sync-note.svelte";
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
  <SyncNote title={copy.title}>
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
  </SyncNote>
{/if}

{#if userState.syncLane?.kind === "computer"}
  <CourierNote />
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
  .sync-trouble__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 2px;
  }
</style>
