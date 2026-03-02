<script lang="ts">
  import { RotateCcw, Trash2 } from "@lucide/svelte";

  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let open = $state(false);

  function handleReset() {
    userState.resetAll();
    open = false;
  }
</script>

<Card.Root class="border-red-200 dark:border-red-900">
  <Card.Header>
    <Card.Title class="text-red-600 dark:text-red-400">Danger Zone</Card.Title>
  </Card.Header>
  <Card.Content>
    <AlertDialog.Root bind:open>
      <AlertDialog.Trigger>
        {#snippet child({ props })}
          <Button class="w-full" variant="outline" {...props}>
            <RotateCcw />
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
            <Trash2 />
            Yes, reset everything
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>
  </Card.Content>
</Card.Root>
