<script lang="ts">
  import { version } from "$app/environment";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import PageHeader from "$lib/components/page-header.svelte";
  import { trackerData } from "$lib/data/index.js";

  import BackupCard from "./backup-card.svelte";
  import DangerZoneCard from "./danger-zone-card.svelte";
  import ImportCard from "./import-card.svelte";
  import SpoilersCard from "./spoilers-card.svelte";
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

<svelte:head>
  <title>Settings — Harvest Helper</title>
</svelte:head>

<PageHeader title="Settings" />

<div class="flex flex-col gap-6 p-4">
  <section class="flex flex-col gap-4">
    <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Interface</h2>
    <ThemeCard />
    <SpoilersCard />
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
    <a href={resolve("/privacy")} class="mt-1 inline-block underline hover:text-foreground">
      Privacy Policy
    </a>
  </div>
</div>
