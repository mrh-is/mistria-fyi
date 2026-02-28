<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

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

<Card.Root>
  <Card.Header>
    <Card.Title>Spoilers</Card.Title>
  </Card.Header>
  <Card.Content>
    <label class="flex cursor-pointer items-center gap-3 text-sm">
      <Switch
        class="h-5 w-9 rounded-md px-px *:data-[slot=switch-thumb]:size-4 *:data-[slot=switch-thumb]:rounded-sm data-[state=checked]:bg-primary *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-full data-[state=unchecked]:bg-input"
        bind:checked={switchChecked}
        onCheckedChange={handleSpoilersChange}
      />
      Show all spoilers
    </label>
  </Card.Content>
</Card.Root>
