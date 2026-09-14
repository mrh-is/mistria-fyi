<script lang="ts">
  import { IconFileDownload, IconPencil, IconQrcode } from "@tabler/icons-svelte-runes";

  import { resolve } from "$app/paths";
  import * as Card from "$lib/components/ui/card/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  function startManually() {
    userState.applyStartingItems();
  }

  // Touch device + width < 1024 = treat as phone/tablet
  const isMobile =
    typeof window !== "undefined"
      ? navigator.maxTouchPoints > 0 && window.innerWidth < 1024
      : false;

  // Escape hatch: user can flip the detected mode
  let overrideDesktop = $state(false);

  let showMobileFlow = $derived(isMobile && !overrideDesktop);
</script>

{#if !userState.hasAnyProgress}
  <Card.Root>
    <Card.Content class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <h2 class="text-base font-semibold">Welcome, farmer! 🌾</h2>
        {#if showMobileFlow}
          <p class="text-sm text-muted-foreground">
            Already tracking on another device? Scan the QR code to transfer your progress here
            instantly.
          </p>
          <p class="text-sm text-muted-foreground">
            Or start tracking manually — this will check off the items you begin the game with.
          </p>
        {:else}
          <p class="text-sm text-muted-foreground">
            Import your save file to auto-populate your progress.
          </p>
          <p class="text-sm text-muted-foreground">
            Or start tracking manually — this will check off the items you begin the game with.
          </p>
        {/if}
      </div>

      <div class="flex flex-col gap-2 sm:flex-row">
        {#if showMobileFlow}
          <a
            href="{resolve('/data')}?section=transfer"
            class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80"
          >
            <IconQrcode class="size-4 shrink-0" />
            Scan QR from another device
          </a>
        {:else}
          <a
            href="{resolve('/data')}?section=import"
            class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80"
          >
            <IconFileDownload class="size-4 shrink-0" />
            Import from save file
          </a>
        {/if}

        <button
          type="button"
          onclick={startManually}
          class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent/80"
        >
          <IconPencil class="size-4 shrink-0" />
          Start tracking manually
        </button>
      </div>

      {#if showMobileFlow}
        <button
          type="button"
          onclick={() => (overrideDesktop = true)}
          class="text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Uhh, I'm on my computer actually →
        </button>
      {:else if isMobile}
        <button
          type="button"
          onclick={() => (overrideDesktop = false)}
          class="text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          ← I want to scan a QR code instead
        </button>
      {/if}
    </Card.Content>
  </Card.Root>
{/if}
