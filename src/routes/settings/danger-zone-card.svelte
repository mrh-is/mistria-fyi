<script lang="ts">
  import { IconRotate, IconTrash } from "@tabler/icons-svelte-runes";

  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SettingsCard from "./settings-card.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let resetDialogOpen = $state(false);

  function handleReset() {
    userState.resetAll();
    resetDialogOpen = false;
  }
</script>

<SettingsCard bind:open title="Danger Zone" summary="Erase all tracked progress." variant="danger">
  <AlertDialog.Root bind:open={resetDialogOpen}>
    <AlertDialog.Trigger>
      {#snippet child({ props })}
        <Button class="w-full" variant="outline" {...props}>
          <IconRotate />
          Reset all progress
        </Button>
      {/snippet}
    </AlertDialog.Trigger>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>Reset all progress?</AlertDialog.Title>
        <AlertDialog.Description>
          This will erase all your tracked progress. This cannot be undone.
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>Never mind</AlertDialog.Cancel>
        <AlertDialog.Action
          class="bg-destructive text-white hover:bg-destructive/90"
          onclick={handleReset}
        >
          <IconTrash />
          Yes, reset everything
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
</SettingsCard>
