<script lang="ts">
  import IconArrowRight from "@tabler/icons-svelte-runes/icons/arrow-right";
  import IconCheck from "@tabler/icons-svelte-runes/icons/check";
  import { tick } from "svelte";

  import { Button } from "#lib/components/ui/button/index.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncCourier } from "#lib/sync/courier-state.svelte.js";
  import { stampOf } from "#lib/sync/read-save.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { messageParts } from "#lib/utils/message-parts.js";

  import CodeArea from "./code-area.svelte";
  import FindSaveStep from "./find-save-step.svelte";
  import SetupStep from "./setup-step.svelte";

  import type { ReadSave } from "#lib/sync/read-save.js";
  import type { SaveSource } from "#lib/sync/save-source.js";

  let { announce, linkOrigin }: { announce: (message: string) => void; linkOrigin: string } =
    $props();

  type Step = "done" | "farm" | "find" | "share";

  // A device already in the computer lane resumes at the code.
  let step = $state<Step>(userState.syncLane?.kind === "computer" ? "share" : "find");
  let save = $state.raw<null | ReadSave>(null);
  let source = $state.raw<null | SaveSource>(null);
  let retryHint = $state<null | string>(null);
  let paused = $state(false);
  let farmTitle = $state<HTMLElement>();
  let shareTitle = $state<HTMLElement>();
  let doneTitle = $state<HTMLElement>();

  // The copy follows whether this save file is watched, not what the browser could do.
  const watched = $derived(
    source
      ? source.kind === "handle"
      : syncCourier.status.source !== "file" && syncCourier.status.source !== "none",
  );
  const hasCode = $derived(
    userState.syncLane?.kind === "computer" && userState.syncLane.code !== undefined,
  );
  const identity = $derived(save?.metadata ?? userState.state.lastImport);
  const farmSummary = $derived(
    identity?.playerName && identity.farmName
      ? `${identity.playerName} on ${identity.farmName}`
      : undefined,
  );
  const fileSummary = $derived(save?.fileName);

  async function focusStep(target: () => HTMLElement | undefined): Promise<void> {
    await tick();
    target()?.focus();
  }

  function handleRead(read: ReadSave, from: SaveSource): void {
    save = read;
    source = from;
    retryHint = null;
    step = "farm";
    void focusStep(() => farmTitle);
  }

  function confirmFarm(): void {
    if (!save) return;
    // “Yep!” applies the save here, in the write that starts the computer lane.
    const chosen = source;
    void (async () => {
      const started = await userState.startSyncLane(
        { kind: "computer" },
        save,
        undefined,
        stampOf(save),
      );
      if (started && chosen) await syncCourier.take(chosen);
    })();
    step = "share";
    announce("Is this your farm?");
    void focusStep(() => shareTitle);
  }

  function rejectFarm(): void {
    save = null;
    source = null;
    retryHint = "No worries! Pick the newest file that ends in “autosave”.";
    step = "find";
  }

  function skipSharing(): void {
    step = "done";
    void focusStep(() => doneTitle);
  }

  const doneCopy = $derived(
    watched
      ? "While this tab’s open, we’ll sync your save file every time you sleep. So leave it open while you play!"
      : "Whenever you’re done playing, drop your save file in again and we’ll sync it.",
  );
</script>

{#if step === "done"}
  <div class="done" role="status">
    <h2 bind:this={doneTitle} tabindex="-1">Nice, you’re all set!</h2>
    <p>{doneCopy}</p>
    <Button href={localizedHref("")}>
      <IconArrowRight />
      Go to my field guide
    </Button>
  </div>
{/if}

<div class="steps">
  <SetupStep
    numeral="i"
    title="Find your save file"
    state={step === "find" ? "active" : "done"}
    summary={fileSummary}
  >
    <FindSaveStep hint={retryHint} onread={handleRead} />
  </SetupStep>

  <SetupStep
    numeral="ii"
    title="Is this your farm?"
    state={step === "farm" ? "active" : step === "find" ? "pending" : "done"}
    summary={farmSummary}
    bind:titleRef={farmTitle}
  >
    <p class="farm-question">
      {#if save?.metadata.playerName && save.metadata.farmName}
        {@const names = { farm: save.metadata.farmName, farmer: save.metadata.playerName }}
        {#each messageParts<"farm" | "farmer">((slot) => `Perfect! Looks like that save file is for ${slot("farmer")} on ${slot("farm")}, is that right?`) as part, index (index)}
          {#if typeof part === "string"}{part}{:else}<strong>{names[part.slot]}</strong>{/if}
        {/each}
      {:else}
        Perfect! We found a farm in that save file. Is it yours?
      {/if}
    </p>
    <div class="farm-actions">
      <Button onclick={confirmFarm}>
        <IconCheck />
        Yep!
      </Button>
      <Button variant="outline" onclick={rejectFarm}>Hmm, no, try that again</Button>
    </div>
  </SetupStep>

  <SetupStep
    numeral="iii"
    title="Wanna track this on your phone?"
    state={step === "share" ? "active" : step === "done" ? "done" : "pending"}
    summary={step === "done" ? "Skipped. Show a code any time from Data." : undefined}
    bind:titleRef={shareTitle}
  >
    <p class="share-body">
      Or another device. Scan this code with it, and it’ll sync your save file from here on out.
    </p>
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
        <Button onclick={skipSharing}>Okay, I’ll set it up later</Button>
      {:else if hasCode}
        <p class="share-finish">{doneCopy}</p>
        <Button href={localizedHref("")}>
          <IconArrowRight />
          Go to my field guide
        </Button>
      {:else}
        <Button variant="ghost" onclick={skipSharing}>No thanks, I’ll track here</Button>
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
