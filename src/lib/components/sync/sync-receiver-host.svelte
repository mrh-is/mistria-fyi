<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { toast } from "svelte-sonner";

  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncReceiver } from "#lib/sync/receiver-state.svelte.js";

  import SyncQuestionDialog from "./sync-question-dialog.svelte";

  import type { SyncTell } from "#lib/sync/receiver.js";

  function tell({ applied, kept, switchedFrom }: SyncTell): void {
    if (switchedFrom) {
      const farm = switchedFrom.farmName;
      toast(farm ? m.sync_tell_switched({ farm }) : m.sync_tell_switched_unnamed());
    }
    if (applied) toast(m.sync_tell_applied());
    if (kept) toast(m.sync_tell_kept());
  }

  onMount(() => syncReceiver.start(tell));

  $effect(() => {
    // Any of these changes what the leading tab should be doing.
    void userState.syncLane;
    void userState.syncBlocked;
    void userState.syncReceipt;
    untrack(() => {
      syncReceiver.update();
    });
  });
</script>

{#if syncReceiver.question}
  <SyncQuestionDialog question={syncReceiver.question} />
{/if}
