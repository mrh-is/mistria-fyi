<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { toast } from "svelte-sonner";

  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncCourier } from "#lib/sync/courier-state.svelte.js";
  import { syncReceiver } from "#lib/sync/receiver-state.svelte.js";

  import SyncQuestionDialog from "./sync-question-dialog.svelte";

  import type { SyncTell } from "#lib/sync/receiver.js";

  function tell({ applied, kept, switchedFrom }: SyncTell): void {
    if (switchedFrom) {
      const farm = switchedFrom.farmName;
      toast(
        farm
          ? `New farm! We saved a backup of ${farm}. Restore it any time from Data.`
          : "New farm! We saved a backup of your last one. Restore it any time from Data.",
      );
    }
    if (applied) toast("Your latest save file changed a few things here.");
    if (kept) {
      toast("We kept a few things you checked off by hand that your save file sees differently.");
    }
  }

  onMount(() => {
    const stopReceiver = syncReceiver.start(tell);
    const stopCourier = syncCourier.start();
    return () => {
      stopCourier();
      stopReceiver();
    };
  });

  $effect(() => {
    // Any of these changes what the leading tab should be doing.
    void userState.syncLane;
    void userState.syncBlocked;
    void userState.syncReceipt;
    untrack(() => {
      syncReceiver.update();
      syncCourier.update();
    });
  });
</script>

{#if syncReceiver.question}
  <SyncQuestionDialog question={syncReceiver.question} />
{/if}
