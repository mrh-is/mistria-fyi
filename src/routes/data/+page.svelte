<script lang="ts">
  import { IconInfoCircle, IconMessageReport, IconRobot } from "@tabler/icons-svelte-runes";
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
  import { openThenScroll } from "./data-effects.js";
  import ImportCard from "./import-card.svelte";
  import TransferCard from "./transfer-card.svelte";

  let aiDisclosureOpen = $state(false);
  let feedbackOpen = $state(false);
  let importSection = $state<HTMLElement | null>(null);
  let transferSection = $state<HTMLElement | null>(null);
  let importOpen = $state(page.url.searchParams.get("section") === "import");
  let transferOpen = $state(page.url.searchParams.get("section") === "transfer");

  function goBack(event: MouseEvent): void {
    if (history.length <= 1) return;
    event.preventDefault();
    history.back();
  }

  function scrollToTransfer(): void {
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
    const target = section === "transfer" ? transferSection : importSection;
    if (section !== "transfer" && section !== "import") return;
    void openThenScroll(
      () => (section === "transfer" ? (transferOpen = true) : (importOpen = true)),
      () =>
        target?.scrollIntoView({
          behavior: prefersReducedMotion.current ? "auto" : "smooth",
          block: "start",
        }),
      tick,
    );
  });
</script>

<svelte:head>
  <title>Data management — Mistria Field Guide</title>
</svelte:head>

<div inert={feedbackOpen ? true : undefined}>
  <PageHeader title="Data management" backLabel="Go back" onback={goBack} />

  <div class="data-page">
    <p class="data-page__intro">Import, move, back up, or reset your Field Guide progress.</p>

    <section aria-labelledby="data-tools-heading">
      <h2 id="data-tools-heading">Field kit</h2>
      <div class="data-page__tools">
        <div bind:this={importSection}>
          <ImportCard bind:open={importOpen} onScrollToTransfer={scrollToTransfer} />
        </div>
        <div bind:this={transferSection}>
          <TransferCard bind:open={transferOpen} />
        </div>
        <BackupCard />
      </div>
    </section>

    <section class="data-page__danger" aria-labelledby="reset-heading">
      <h2 id="reset-heading">Reset</h2>
      <DangerZoneCard />
    </section>

    <footer class="data-page__footer">
      <p>Fields of Mistria v{trackerData.version} · Field Guide v{version}</p>
      <div>
        <button type="button" onclick={() => (feedbackOpen = true)}>
          <IconMessageReport class="size-3.5" />Send feedback
        </button>
        <span>·</span>
        <a href={resolve("/privacy")}>Privacy</a>
        <span>·</span>
        <a href={resolve("/about")}><IconInfoCircle class="size-3.5" />About this guide</a>
        <span>·</span>
        <button type="button" onclick={() => (aiDisclosureOpen = true)}>
          <IconRobot class="size-3.5" />AI disclosure
        </button>
      </div>
    </footer>
  </div>
</div>

<AiDisclosureDialog bind:open={aiDisclosureOpen} />
<FeedbackPanel
  open={feedbackOpen}
  onclose={() => (feedbackOpen = false)}
  pickerEnabled={false}
  resetKey={page.url.pathname}
/>

<style>
  .data-page {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 18px 16px 28px;
  }

  .data-page__intro {
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: 13px;
  }

  .data-page h2 {
    margin-bottom: 8px;
    color: var(--ink-muted);
    font-family: var(--font-controls);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .data-page__tools {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .data-page__danger {
    padding-top: 4px;
    border-top: 1px solid color-mix(in srgb, var(--destructive) 28%, transparent);
  }

  .data-page__footer {
    padding-top: 8px;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: 11px;
    text-align: center;
  }

  .data-page__footer div,
  .data-page__footer :is(button, a) {
    display: inline-flex;
    align-items: center;
  }

  .data-page__footer div {
    flex-wrap: wrap;
    justify-content: center;
    gap: 0 8px;
    margin-top: 3px;
  }

  .data-page__footer :is(button, a) {
    min-height: 44px;
    gap: 4px;
    text-decoration: underline;
  }

  .data-page__footer :is(button, a):is(:hover, :focus-visible) {
    color: var(--ink);
  }
</style>
