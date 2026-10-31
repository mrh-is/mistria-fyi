<script lang="ts">
  import IconArrowRight from "@tabler/icons-svelte-runes/icons/arrow-right";
  import IconCheck from "@tabler/icons-svelte-runes/icons/check";
  import { tick } from "svelte";

  import { Button } from "#lib/components/ui/button/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { stampOf } from "#lib/sync/read-save.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { messageParts } from "#lib/utils/message-parts.js";

  import CodeArea from "./code-area.svelte";
  import FindSaveStep from "./find-save-step.svelte";
  import SetupStep from "./setup-step.svelte";

  import type { ReadSave } from "#lib/sync/read-save.js";

  let { announce, linkOrigin }: { announce: (message: string) => void; linkOrigin: string } =
    $props();

  type Step = "done" | "farm" | "find" | "share";

  // A device already in the computer lane resumes at the code.
  let step = $state<Step>(userState.syncLane?.kind === "computer" ? "share" : "find");
  let save = $state.raw<null | ReadSave>(null);
  let retryHint = $state<null | string>(null);
  let paused = $state(false);
  let farmTitle = $state<HTMLElement>();
  let shareTitle = $state<HTMLElement>();
  let doneTitle = $state<HTMLElement>();

  const watchable = "FileSystemObserver" in globalThis;
  const hasCode = $derived(
    userState.syncLane?.kind === "computer" && userState.syncLane.code !== undefined,
  );
  const identity = $derived(save?.metadata ?? userState.state.lastImport);
  const farmSummary = $derived(
    identity?.playerName && identity.farmName
      ? m.sync_farm_summary({ farm: identity.farmName, farmer: identity.playerName })
      : undefined,
  );
  const fileSummary = $derived(save?.fileName);

  async function focusStep(target: () => HTMLElement | undefined): Promise<void> {
    await tick();
    target()?.focus();
  }

  function handleRead(read: ReadSave): void {
    save = read;
    retryHint = null;
    step = "farm";
    void focusStep(() => farmTitle);
  }

  function confirmFarm(): void {
    if (!save) return;
    // “Yep!” applies the save here, in the write that starts the computer lane.
    userState.startSyncLane({ kind: "computer" }, save, undefined, stampOf(save));
    step = "share";
    announce(m.sync_farm_step_title());
    void focusStep(() => shareTitle);
  }

  function rejectFarm(): void {
    save = null;
    retryHint = m.sync_farm_no_hint();
    step = "find";
  }

  function skipSharing(): void {
    step = "done";
    void focusStep(() => doneTitle);
  }

  const doneCopy = $derived(watchable ? m.sync_done_watched() : m.sync_done_redrop());
</script>

{#if step === "done"}
  <div class="done" role="status">
    <h2 bind:this={doneTitle} tabindex="-1">{m.sync_done_title()}</h2>
    <p>{doneCopy}</p>
    <Button href={localizedHref("")}>
      <IconArrowRight />
      {m.sync_done_home()}
    </Button>
  </div>
{/if}

<div class="steps">
  <SetupStep
    numeral="i"
    title={m.sync_find_title()}
    state={step === "find" ? "active" : "done"}
    summary={fileSummary}
  >
    <FindSaveStep hint={retryHint} onread={handleRead} />
  </SetupStep>

  <SetupStep
    numeral="ii"
    title={m.sync_farm_step_title()}
    state={step === "farm" ? "active" : step === "find" ? "pending" : "done"}
    summary={farmSummary}
    bind:titleRef={farmTitle}
  >
    <p class="farm-question">
      {#if save?.metadata.playerName && save.metadata.farmName}
        {@const names = { farm: save.metadata.farmName, farmer: save.metadata.playerName }}
        {#each messageParts<"farm" | "farmer">( (slot) => m.sync_farm_title( { farm: slot("farm"), farmer: slot("farmer") } ) ) as part, index (index)}
          {#if typeof part === "string"}{part}{:else}<strong>{names[part.slot]}</strong>{/if}
        {/each}
      {:else}
        {m.sync_farm_title_unnamed()}
      {/if}
    </p>
    <div class="farm-actions">
      <Button onclick={confirmFarm}>
        <IconCheck />
        {m.sync_farm_yes()}
      </Button>
      <Button variant="outline" onclick={rejectFarm}>{m.sync_farm_no()}</Button>
    </div>
  </SetupStep>

  <SetupStep
    numeral="iii"
    title={m.sync_phone_title()}
    state={step === "share" ? "active" : step === "done" ? "done" : "pending"}
    summary={step === "done" ? m.sync_share_skipped() : undefined}
    bind:titleRef={shareTitle}
  >
    <p class="share-body">{m.sync_phone_body()}</p>
    <div class="share-code">
      <CodeArea
        {linkOrigin}
        onpaused={() => {
          paused = true;
        }}
        onshared={() => {
          paused = false;
        }}
      />
    </div>
    {#snippet footer()}
      {#if paused}
        <Button onclick={skipSharing}>{m.sync_phone_later()}</Button>
      {:else if hasCode}
        <p class="share-finish">{doneCopy}</p>
        <Button href={localizedHref("")}>
          <IconArrowRight />
          {m.sync_done_home()}
        </Button>
      {:else}
        <Button variant="ghost" onclick={skipSharing}>{m.sync_phone_no()}</Button>
      {/if}
    {/snippet}
  </SetupStep>
</div>

<style>
  .steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .done {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 10px;
    padding: 14px;
    color: color-mix(in srgb, var(--color-status-success) 80%, var(--color-ink));
    background: color-mix(in srgb, var(--color-status-success) 12%, var(--color-paper));
    font-family: var(--font-annotation);
    font-size: var(--text-sm);
  }

  .done h2 {
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 600;
  }

  .done h2:focus {
    outline: none;
  }

  .farm-question,
  .share-body {
    margin-bottom: 10px;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .farm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* The code area runs to the card's edges. */
  .share-code {
    margin-inline: -12px;
    margin-bottom: -14px;
  }

  .share-finish {
    min-width: 0;
    flex: 1 1 180px;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
  }
</style>
