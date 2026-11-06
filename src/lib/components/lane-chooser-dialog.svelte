<script lang="ts">
  import DialogCloseButton from "#lib/components/dialog-close-button.svelte";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import WelcomeCard from "#lib/components/welcome-card.svelte";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
</script>

<Dialog.Root
  open={userState.trackingLaneNeeded}
  onOpenChange={(open) => {
    if (!open) userState.cancelLaneChoice();
  }}
>
  <Dialog.Content showCloseButton={false} class="max-h-[90dvh] overflow-y-auto">
    <Dialog.Title class="sr-only">{m.tracking_choose_title()}</Dialog.Title>
    <Dialog.Description class="sr-only">{m.tracking_choose_body()}</Dialog.Description>
    <WelcomeCard
      title={m.tracking_choose_title()}
      body={m.tracking_choose_body()}
      onSync={() => userState.chooseSyncTracking()}
    />
    <DialogCloseButton />
  </Dialog.Content>
</Dialog.Root>
