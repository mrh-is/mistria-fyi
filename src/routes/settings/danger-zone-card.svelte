<script lang="ts">
  import { RotateCcw, Trash2 } from "@lucide/svelte";

  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let showResetConfirm = $state(false);

  function handleReset() {
    userState.resetAll();
    showResetConfirm = false;
  }
</script>

<Card.Root class="border-red-200 dark:border-red-900">
  <Card.Header>
    <Card.Title class="text-red-600 dark:text-red-400">Danger Zone</Card.Title>
  </Card.Header>
  <Card.Content>
    {#if showResetConfirm}
      <p class="mb-3 text-base">Are you sure? This will erase all your tracked progress.</p>
      <div class="flex w-full flex-col gap-2">
        <Button variant="destructive" onclick={handleReset}>
          <Trash2 />
          Yes, reset everything
        </Button>
        <Button variant="outline" onclick={() => (showResetConfirm = false)}>Never mind</Button>
      </div>
    {:else}
      <Button
        class="w-full"
        variant="outline"
        onclick={() => {
          showResetConfirm = true;
        }}
      >
        <RotateCcw />
        Reset all progress
      </Button>
    {/if}
  </Card.Content>
</Card.Root>
