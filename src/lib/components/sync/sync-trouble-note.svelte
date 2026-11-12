<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
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
        return waiting
          ? { title: "Your save file has a question for you. Nothing changes until you answer." }
          : undefined;
      case "blocked":
        return {
          title:
            "Before we can sync your save file, this device’s data needs a look. Head to Data to sort it out.",
        };
      case "retired":
        return {
          body: "If it made a new code, scan it here. Or stop syncing and keep tracking by hand.",
          title: "Your computer stopped sharing this save file",
        };
      case "switch-failed":
        return {
          body: "Your progress is safe! This save file is a different farm, but we couldn’t back up the one here, so nothing changed. We’ll try again with your next save file.",
          title: "We didn’t switch farms",
        };
      case "unreadable":
        return {
          body: "Your progress is safe! For more info, check Mistria Field Guide on your computer.",
          title: "Your computer is having trouble reading your save file",
        };
      case "update-computer":
        return {
          title: "The field guide on your computer needs a refresh to keep your save file syncing.",
        };
      case "update-here":
        return {
          title: "The field guide on this device needs a refresh to keep your save file syncing.",
        };
      case "write-failed":
        return {
          body: "Your progress is safe! This device wouldn’t let us store it. It might be out of space. We’ll try again with your next save file, or you can try now.",
          title: "We couldn’t store your latest save file",
        };
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
        <Button size="sm" href={localizedHref("sync")}>Scan the code</Button>
        <Button
          size="sm"
          variant="outline"
          onclick={() => {
            stopOpen = true;
          }}
        >
          <!-- @wc-context: sync retired stop -->Stop syncing
        </Button>
      </div>
    {:else if status.kind === "blocked"}
      <div class="sync-trouble__actions">
        <Button size="sm" href={localizedHref("data")}>Sync & data settings</Button>
      </div>
    {:else if status.kind === "update-here"}
      <div class="sync-trouble__actions">
        <Button
          size="sm"
          onclick={() => {
            globalThis.location.reload();
          }}
        >
          Refresh
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
          <!-- @wc-context: sync try again -->Try again
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
          Answer it
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
  title="Stop syncing?"
  body="Your progress stays right here, and you’ll check things off by hand from now on. If you sync your save file again later, it’ll start fresh."
  actions={[
    {
      label: "Cancel",
      onclick: () => {
        stopOpen = false;
      },
    },
    {
      label: /* @wc-context: sync stop confirm */ "Stop syncing",
      onclick: () => void confirmStop(),
      primary: true,
    },
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
