<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";

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

<div class="flex flex-col gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
  <!-- Header -->
  <div class="flex items-center gap-2">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- known route -->
    <a class="text-muted-foreground hover:text-foreground" href="/">
      <ArrowLeft class="size-5" />
    </a>
    <h1 class="text-xl font-semibold">Settings</h1>
  </div>

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
