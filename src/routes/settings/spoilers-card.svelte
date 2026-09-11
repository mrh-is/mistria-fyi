<script lang="ts">
  import { IconEye, IconEyeOff } from "@tabler/icons-svelte-runes";

  import BlockySwitch from "$lib/components/blocky-switch.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SettingsCard from "./settings-card.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let showConfirm = $state(false);
  let switchChecked = $state(userState.state.showSpoilers);

  // Keep the switch in sync with the store, especially after a cancelled dialog
  $effect(() => {
    if (!showConfirm) {
      switchChecked = userState.state.showSpoilers;
    }
  });

  function handleSpoilersChange(checked: boolean) {
    if (checked) {
      showConfirm = true;
    } else {
      userState.toggleShowSpoilers();
    }
  }

  function handleConfirm() {
    userState.toggleShowSpoilers();
    showConfirm = false;
  }
</script>

<AlertDialog.Root
  open={showConfirm}
  onOpenChange={(v) => {
    showConfirm = v;
  }}
>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Show all spoilers?</AlertDialog.Title>
      <AlertDialog.Description>This will reveal hidden content.</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Never mind</AlertDialog.Cancel>
      <AlertDialog.Action onclick={handleConfirm}>Yes, show spoilers</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<SettingsCard
  bind:open
  title="Spoilers"
  summary={userState.state.showSpoilers ? "Spoilers are shown" : "Spoilers are hidden"}
>
  <BlockySwitch
    bind:checked={switchChecked}
    onCheckedChange={handleSpoilersChange}
    checkedIcon={IconEye}
    uncheckedIcon={IconEyeOff}
  >
    Show all spoilers
  </BlockySwitch>
</SettingsCard>
