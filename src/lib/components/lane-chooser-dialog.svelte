<script lang="ts">
  import DialogCloseButton from "#lib/components/dialog-close-button.svelte";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import WelcomeCard from "#lib/components/welcome-card.svelte";
  import { userState } from "#lib/stores/user-state.svelte.js";
</script>

<Dialog.Root
  open={userState.trackingLaneNeeded}
  onOpenChange={(open) => {
    if (!open) userState.cancelLaneChoice();
  }}
>
  <Dialog.Content showCloseButton={false} class="max-h-[90dvh] overflow-y-auto">
    <Dialog.Title class="sr-only">How do you wanna track your farm?</Dialog.Title>
    <Dialog.Description class="sr-only"
      >Before we can check that off, choose how you’ll track your progress. Pick tracking by hand to
      keep the check-off, or set up syncing from your save file.</Dialog.Description
    >
    <WelcomeCard
      framed={false}
      title="How do you wanna track your farm?"
      body="Before we can check that off, choose how you’ll track your progress. Pick tracking by hand to keep the check-off, or set up syncing from your save file."
      onSync={() => userState.chooseSyncTracking()}
    />
    <DialogCloseButton />
  </Dialog.Content>
</Dialog.Root>
