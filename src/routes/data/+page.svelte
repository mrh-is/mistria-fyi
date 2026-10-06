<script lang="ts">
  import { tick } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";

  import PageHeader from "#lib/components/page-header.svelte";
  import { trackerData } from "#lib/data/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { version } from "$app/env";
  import { page } from "$app/state";

  import BackupCard from "./backup-card.svelte";
  import DangerZoneCard from "./danger-zone-card.svelte";
  import { openThenScroll } from "./data-effects.js";
  import ImportCard from "./import-card.svelte";
  import TransferCard from "./transfer-card.svelte";

  let importSection = $state<HTMLElement | null>(null);
  let transferSection = $state<HTMLElement | null>(null);
  let importOpen = $state(page.url.searchParams.get("section") === "import");
  let transferOpen = $state(page.url.searchParams.get("section") === "transfer");

  function scrollToTransfer(): void {
    void openThenScroll(
      () => {
        transferOpen = true;
      },
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
      () => {
        if (section === "transfer") {
          transferOpen = true;
        } else {
          importOpen = true;
        }
      },
      () =>
        target?.scrollIntoView({
          behavior: prefersReducedMotion.current ? "auto" : "smooth",
          block: "start",
        }),
      tick,
    );
  });
</script>

<PageHeader title={m.data_title()} backLabel={m.common_go_back()} historyBack />

<div class="data-page">
  <p class="data-page__intro">{m.data_intro()}</p>

  <section aria-labelledby="data-tools-heading">
    <h2 id="data-tools-heading">{m.data_field_kit_heading()}</h2>
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
    <h2 id="reset-heading">{m.data_reset_heading()}</h2>
    <DangerZoneCard />
  </section>

  <footer class="data-page__footer">
    <p>{m.data_footer_versions({ appVersion: version, gameVersion: trackerData.version })}</p>
  </footer>
</div>

<style>
  .data-page {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 18px 16px 28px;
  }

  .data-page__intro {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-sm);
  }

  .data-page h2 {
    margin-bottom: 8px;
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
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
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    text-align: center;
  }
</style>
