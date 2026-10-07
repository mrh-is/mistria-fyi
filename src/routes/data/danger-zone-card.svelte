<script lang="ts">
  import IconRotate from "@tabler/icons-svelte-runes/icons/rotate";
  import IconTrash from "@tabler/icons-svelte-runes/icons/trash";

  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import DataCard from "./data-card.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let resetDialogOpen = $state(false);

  function handleReset() {
    userState.resetProgress();
    resetDialogOpen = false;
  }
</script>

<DataCard
  bind:open
  title={m.danger_zone_title()}
  summary={m.danger_zone_summary()}
  variant="danger"
>
  <AlertDialog.Root bind:open={resetDialogOpen}>
    <AlertDialog.Trigger>
      {#snippet child({ props })}
        <Button class="w-full" variant="outline" {...props}>
          <IconRotate />
          {m.danger_zone_reset_action()}
        </Button>
      {/snippet}
    </AlertDialog.Trigger>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>{m.danger_zone_confirm_title()}</AlertDialog.Title>
        <AlertDialog.Description>
          {m.danger_zone_confirm_description()}
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>{m.settings_spoilers_cancel()}</AlertDialog.Cancel>
        <AlertDialog.Action
          class="bg-destructive text-white hover:bg-destructive/90"
          onclick={handleReset}
        >
          <IconTrash />
          {m.danger_zone_confirm_action()}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
</DataCard>
