<script lang="ts">
  import { Bot, MessageCircleWarning } from "@lucide/svelte";
  import { tick } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";

  import { version } from "$app/environment";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import FeedbackPanel from "$lib/components/feedback-panel.svelte";
  import PageHeader from "$lib/components/page-header.svelte";
  import { trackerData } from "$lib/data/index.js";

  import AiDisclosureDialog from "./ai-disclosure-dialog.svelte";
  import BackupCard from "./backup-card.svelte";
  import DangerZoneCard from "./danger-zone-card.svelte";
  import ImportCard from "./import-card.svelte";
  import { openThenScroll } from "./settings-effects.js";
  import SpoilersCard from "./spoilers-card.svelte";
  import ThemeCard from "./theme-card.svelte";
  import TransferCard from "./transfer-card.svelte";

  let aiDisclosureOpen = $state(false);
  let feedbackOpen = $state(false);
  let importSection = $state<HTMLElement | null>(null);
  let transferSection = $state<HTMLElement | null>(null);
  let importOpen = $state(page.url.searchParams.get("section") === "import");
  let transferOpen = $state(page.url.searchParams.get("section") === "transfer");

  function scrollToTransfer() {
    void openThenScroll(
      () => (transferOpen = true),
      () =>
        transferSection?.scrollIntoView({
          behavior: prefersReducedMotion.current ? "auto" : "smooth",
          block: "start",
        }),
      tick,
    );
  }

  $effect(() => {
    const section = page.url.searchParams.get("section");
    if (section === "transfer") {
      void openThenScroll(
        () => (transferOpen = true),
        () =>
          transferSection?.scrollIntoView({
            behavior: prefersReducedMotion.current ? "auto" : "smooth",
            block: "start",
          }),
        tick,
      );
    } else if (section === "import") {
      void openThenScroll(
        () => (importOpen = true),
        () =>
          importSection?.scrollIntoView({
            behavior: prefersReducedMotion.current ? "auto" : "smooth",
            block: "start",
          }),
        tick,
      );
    }
  });
</script>

<svelte:head>
  <title>Settings — Mistria Field Guide</title>
</svelte:head>

<div inert={feedbackOpen ? true : undefined}>
  <PageHeader title="Settings" />

  <div class="flex flex-col gap-6 p-4">
    <section class="flex flex-col gap-4">
      <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Interface
      </h2>
      <ThemeCard />
      <SpoilersCard />
    </section>

    <div class="border-t border-border/50"></div>

    <section class="flex flex-col gap-4">
      <h2 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Getting started
      </h2>
      <div bind:this={importSection}>
        <ImportCard bind:open={importOpen} onScrollToTransfer={scrollToTransfer} />
      </div>
      <div bind:this={transferSection}>
        <TransferCard bind:open={transferOpen} />
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
      <p>Mistria Field Guide v{version}</p>
      <div class="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <button
          class="inline-flex min-h-11 items-center gap-1 underline hover:text-foreground"
          type="button"
          onclick={() => (feedbackOpen = true)}
        >
          <MessageCircleWarning class="size-3.5" />
          Send feedback
        </button>
        <span class="text-border">·</span>
        <a
          href={resolve("/privacy")}
          class="inline-flex min-h-11 items-center underline hover:text-foreground"
          >Privacy policy</a
        >
        <span class="text-border">·</span>
        <button
          class="inline-flex min-h-11 items-center gap-1 underline hover:text-foreground"
          type="button"
          onclick={() => (aiDisclosureOpen = true)}
        >
          <Bot class="size-3.5" />
          AI disclosure
        </button>
      </div>
    </div>
  </div>
</div>

<AiDisclosureDialog bind:open={aiDisclosureOpen} />

<FeedbackPanel
  open={feedbackOpen}
  onclose={() => (feedbackOpen = false)}
  pickerEnabled={false}
  resetKey={page.url.pathname}
/>
