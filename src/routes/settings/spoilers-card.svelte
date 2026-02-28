<script lang="ts">
  import { EyeOff } from "@lucide/svelte";

  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let showConfirm = $state(false);

  function handleEnable() {
    userState.toggleShowSpoilers();
    showConfirm = false;
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Spoilers</Card.Title>
  </Card.Header>
  <Card.Content>
    {#if userState.state.showSpoilers}
      <p class="mb-3 text-sm text-muted-foreground">All spoilers are currently visible.</p>
      <Button
        class="w-full"
        variant="outline"
        onclick={() => {
          userState.toggleShowSpoilers();
        }}
      >
        <EyeOff />
        Hide spoilers
      </Button>
    {:else if showConfirm}
      <p class="mb-3 text-sm text-muted-foreground">
        This will reveal hidden content. Are you sure?
      </p>
      <div class="flex w-full flex-col gap-2">
        <Button variant="default" onclick={handleEnable}>Yes, show spoilers</Button>
        <Button variant="outline" onclick={() => (showConfirm = false)}>Never mind</Button>
      </div>
    {:else}
      <p class="mb-3 text-sm text-muted-foreground">Spoiler content is currently hidden.</p>
      <Button class="w-full" variant="outline" onclick={() => (showConfirm = true)}>
        Show all spoilers
      </Button>
    {/if}
  </Card.Content>
</Card.Root>
