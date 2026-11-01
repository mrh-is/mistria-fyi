<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { syncCourier } from "#lib/sync/courier-state.svelte.js";
  import { guessPlatform } from "#lib/sync/save-folders.js";
  import { messageParts } from "#lib/utils/message-parts.js";

  import SaveDrop from "./save-drop.svelte";
  import SaveFolderPath from "./save-folder-path.svelte";
  import SyncNote from "./sync-note.svelte";

  const status = $derived(syncCourier.status);
  const platform = guessPlatform();
  const unreadableParts = $derived(
    messageParts<"game">((slot) => m.sync_unreadable_why({ game: slot("game") })),
  );
</script>

{#if status.trouble === "unreadable"}
  <SyncNote title={m.sync_unreadable_title()} tone="error">
    <p>{m.sync_unreadable_safe()}</p>
    <p>
      {#each unreadableParts as part, index (index)}
        {#if typeof part === "string"}{part}{:else}<em>{m.sync_unreadable_game()}</em>{/if}
      {/each}
    </p>
    <p>{m.sync_unreadable_for_now()}</p>
  </SyncNote>
{:else if status.trouble === "reallow"}
  <SyncNote title={m.sync_reallow_title()}>
    <p>{m.sync_reallow_body()}</p>
    <div>
      <Button size="sm" onclick={() => void syncCourier.reallow()}>
        {m.sync_reallow_action()}
      </Button>
    </div>
  </SyncNote>
{:else if status.trouble === "moved"}
  <SyncNote title={m.sync_moved_title()}>
    <p>{m.sync_moved_body()}</p>
    <SaveFolderPath {platform} />
    <SaveDrop label={m.sync_find_drop()} onsource={syncCourier.offer} {platform} />
  </SyncNote>
{:else if status.trouble === "other-window"}
  <SyncNote title={m.sync_other_window()} tone="quiet" />
{/if}

{#if status.upload === "paused"}
  <SyncNote title={m.sync_paused_title()} tone="quiet">
    <p>{m.sync_paused_body()}</p>
  </SyncNote>
{:else if status.upload === "unreachable"}
  <SyncNote title={m.sync_unreachable_title()} tone="quiet">
    <p>{m.sync_unreachable_body()}</p>
    <div>
      <Button size="sm" variant="outline" onclick={syncCourier.retry}>
        {m.sync_try_again()}
      </Button>
    </div>
  </SyncNote>
{/if}

{#if status.codeRenewed}
  <SyncNote title={m.sync_link_expired()} tone="quiet" />
{/if}
