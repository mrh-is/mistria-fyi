<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { syncCourier } from "#lib/sync/courier-state.svelte.js";
  import { guessPlatform } from "#lib/sync/save-folders.js";
  import { messageParts } from "#lib/utils/message-parts.js";

  import SaveDrop from "./save-drop.svelte";
  import SaveFolderPath from "./save-folder-path.svelte";
  import SyncNote from "./sync-note.svelte";

  const status = $derived(syncCourier.status);
  const platform = guessPlatform();
  const unreadableParts = $derived(
    messageParts<"game">(
      (slot) =>
        `Number two: This isn’t anything you did. It can happen when ${slot("game")} releases an update. Rest assured that we’re on the case, and this field guide should be updated shortly. When it is, it’ll read your save file again and catch up on everything you’ve done in the meantime.`,
    ),
  );
</script>

{#if status.trouble === "unreadable"}
  <SyncNote title="Hmm, we can’t read your save file" tone="error">
    <p>Number one: Nothing is lost. Your progress is totally safe.</p>
    <p>
      {#each unreadableParts as part, index (index)}
        {#if typeof part === "string"}{part}{:else}<em>Fields of Mistria</em>{/if}
      {/each}
    </p>
    <p>For now, just leave this tab open, and enjoy… whatever is in the new update!</p>
  </SyncNote>
{:else if status.trouble === "reallow"}
  <SyncNote title="Mind letting us read your save file again?">
    <p>Your browser asks after a restart.</p>
    <div>
      <Button size="sm" onclick={() => void syncCourier.reallow()}>Let us read it</Button>
    </div>
    <SaveFolderPath {platform} />
    <SaveDrop label="Drop your autosave here" onsource={syncCourier.offer} {platform} />
  </SyncNote>
{:else if status.trouble === "moved"}
  <SyncNote title="We lost track of your save file">
    <p>Drop it in again and we’re back in business.</p>
    <SaveFolderPath {platform} />
    <SaveDrop label="Drop your autosave here" onsource={syncCourier.offer} {platform} />
  </SyncNote>
{:else if status.trouble === "other-window"}
  <SyncNote title="Your save file is already syncing in another window." tone="quiet" />
{/if}

{#if status.upload === "paused"}
  <SyncNote title="Sync is paused for now" tone="quiet">
    <p>
      We’ve paused save file syncing for a bit to keep things running smoothly. It’ll turn back on
      by itself, usually by tomorrow, and catch up then. Checking things off by hand still works.
    </p>
  </SyncNote>
{:else if status.upload === "update"}
  <SyncNote title="This tracker needs a refresh to keep your save file syncing.">
    <div>
      <Button
        size="sm"
        onclick={() => {
          globalThis.location.reload();
        }}
      >
        Refresh
      </Button>
    </div>
  </SyncNote>
{:else if status.upload === "refused"}
  <SyncNote title="Sync said no to that one">
    <p>
      We got through, but it wouldn’t take your latest save file under this code. Your progress here
      is safe, and this isn’t anything you did. If trying again doesn’t help, make a new code from
      Data.
    </p>
    <div>
      <Button size="sm" variant="outline" onclick={syncCourier.retry}>
        <!-- @wc-context: sync try again -->Try again
      </Button>
    </div>
  </SyncNote>
{:else if status.upload === "unreachable"}
  <SyncNote title="We can’t connect right now" tone="quiet">
    <p>We’ll keep trying, or you can try again.</p>
    <div>
      <Button size="sm" variant="outline" onclick={syncCourier.retry}>
        <!-- @wc-context: sync try again -->Try again
      </Button>
    </div>
  </SyncNote>
{/if}

{#if status.codeRenewed}
  <SyncNote
    title="It’s been a while! We made a new code for your save file. Scan it on your other devices to keep your save file syncing."
    tone="quiet"
  />
{/if}
