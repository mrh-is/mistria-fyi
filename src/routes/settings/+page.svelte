<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { trackerData } from "$lib/data/index.js";

  import BackupCard from "./backup-card.svelte";
  import DangerZoneCard from "./danger-zone-card.svelte";
  import ImportCard from "./import-card.svelte";
  import ThemeCard from "./theme-card.svelte";
  import TransferCard from "./transfer-card.svelte";

  let transferSection = $state<HTMLElement | null>(null);

  function scrollToTransfer() {
    transferSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
</script>

<div
  class="sticky top-0 z-10 flex items-center gap-2 border-b border-border/50 bg-background px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3"
>
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- known route -->
  <a
    class="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"
    href={resolve("/")}
    aria-label="Back to home"
  >
    <ArrowLeft class="size-5" />
  </a>
  <h1 class="flex-1 text-xl font-semibold">Settings</h1>
</div>

<div class="flex flex-col gap-4 p-4">
  <ThemeCard />
  <ImportCard onScrollToTransfer={scrollToTransfer} />
  <div bind:this={transferSection}>
    <TransferCard />
  </div>
  <BackupCard />
  <DangerZoneCard />

  <div class="text-center text-sm text-muted-foreground">
    Game data: Fields of Mistria v{trackerData.version}
  </div>
</div>
