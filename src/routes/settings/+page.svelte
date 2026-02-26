<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";

  import { version } from "$app/environment";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { trackerData } from "$lib/data/index.js";

  import BackupCard from "./backup-card.svelte";
  import DangerZoneCard from "./danger-zone-card.svelte";
  import ImportCard from "./import-card.svelte";
  import ThemeCard from "./theme-card.svelte";
  import TransferCard from "./transfer-card.svelte";

  let importSection = $state<HTMLElement | null>(null);
  let transferSection = $state<HTMLElement | null>(null);

  function scrollToTransfer() {
    transferSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $effect(() => {
    const section = page.url.searchParams.get("section");
    if (section === "transfer") {
      transferSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (section === "import") {
      importSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
</script>

<div
  class="sticky top-0 z-10 flex items-center gap-2 border-b border-border/50 bg-background px-4 pt-safe-or-4 pb-3"
>
  <a
    class="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"
    href={resolve("/")}
    aria-label="Back to home"
  >
    <ArrowLeft class="size-5" />
  </a>
  <h1 class="flex-1 text-xl font-semibold">Settings</h1>
</div>

<div class="flex flex-col gap-6 p-4">
  <section class="flex flex-col gap-4">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Interface</h2>
    <ThemeCard />
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-4">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      Getting started
    </h2>
    <div bind:this={importSection}>
      <ImportCard onScrollToTransfer={scrollToTransfer} />
    </div>
    <div bind:this={transferSection}>
      <TransferCard />
    </div>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-4">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      Data management
    </h2>
    <BackupCard />
    <DangerZoneCard />
  </section>

  <div class="text-center text-sm text-muted-foreground">
    <p>Game data: Fields of Mistria v{trackerData.version}</p>
    <p>Harvest Helper v{version}</p>
  </div>
</div>
