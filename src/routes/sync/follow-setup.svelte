<script lang="ts">
  import IconCamera from "@tabler/icons-svelte-runes/icons/camera";
  import IconClock from "@tabler/icons-svelte-runes/icons/clock";
  import IconLoader2 from "@tabler/icons-svelte-runes/icons/loader-2";
  import { onDestroy } from "svelte";

  import StatusNote from "#lib/components/status-note.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { parseFollowLink } from "#lib/sync/follow.js";
  import { messageParts } from "#lib/utils/message-parts.js";

  import QrScanner from "./qr-scanner.svelte";
  import SetupStep from "./setup-step.svelte";

  import type { FollowKey } from "#lib/sync/follow.js";
  import type { FollowOutcome } from "#lib/sync/sharing.js";

  let {
    onkey,
    onstop,
    outcome,
    pending,
    showStop,
  }: {
    /** A parsed key, from the scanner or the paste field. */
    onkey: (key: FollowKey) => void;
    onstop: () => void;
    /** What the last attempt found; `undefined` before one. */
    outcome: FollowOutcome | undefined;
    /** True while the page fetches the code's save. */
    pending: boolean;
    /** Whether “Stop syncing” makes sense: the device is in a following lane. */
    showStop: boolean;
  } = $props();

  let scanning = $state(false);
  let pasted = $state("");
  let pasteError = $state(false);
  let cameraError = $state<null | string>(null);
  let pasteField = $state<HTMLInputElement>();

  const scanBody = $derived(
    messageParts<"url">(
      (slot) =>
        `On your gaming computer, open ${slot("url")} in Chrome or Edge and go through the steps there. When it shows a code, scan it here.`,
    ),
  );

  function submit(text: string): void {
    const key = parseFollowLink(text);
    pasteError = key === undefined;
    if (key) onkey(key);
    else pasteField?.focus();
  }

  function handleScan(data: string): void {
    scanning = false;
    pasted = data;
    submit(data);
  }

  onDestroy(() => {
    scanning = false;
  });
</script>

{#if outcome?.kind === "empty"}
  <div class="follow-note">
    <IconClock class="follow-note__icon" aria-hidden="true" />
    <div>
      <h2>Almost there</h2>
      <p>
        Your code works, but there’s no save file waiting yet. Open the tracker on your gaming
        computer, and we’ll grab the latest one.
      </p>
      <p class="follow-note__progress" role="status">
        <IconLoader2 class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Waiting for your save file…
      </p>
    </div>
  </div>
  <p class="follow-aside">Nothing on this device changes until a save file arrives.</p>
{:else if outcome?.kind === "retired"}
  <div class="follow-note" role="status">
    <div>
      <h2>Your computer stopped sharing this save file</h2>
      <p>If it made a new code, scan it here. Or stop syncing and keep tracking by hand.</p>
      <div class="follow-note__actions">
        <Button
          size="sm"
          onclick={() => {
            scanning = true;
          }}
        >
          <IconCamera />
          Scan the code
        </Button>
        {#if showStop}
          <Button size="sm" variant="outline" onclick={onstop}
            ><!-- @wc-context: sync retired stop -->Stop syncing</Button
          >
        {/if}
      </div>
    </div>
  </div>
{:else}
  <SetupStep numeral="i" title="Scan the code from your gaming computer" state="active">
    <div class="scan">
      <p>
        {#each scanBody as part, index (index)}
          {#if typeof part === "string"}{part}{:else}<code>mistria.fyi/sync</code>{/if}
        {/each}
      </p>
      <Button
        class="w-full"
        disabled={pending}
        onclick={() => {
          cameraError = null;
          scanning = true;
        }}
      >
        <IconCamera />
        Scan the code
      </Button>
      {#if cameraError}
        <StatusNote tone="warning">{cameraError}</StatusNote>
      {/if}
      <form
        class="scan__paste"
        onsubmit={(event) => {
          event.preventDefault();
          submit(pasted);
        }}
      >
        <label for="sync-paste">Or paste a link</label>
        <div class="scan__row">
          <input
            id="sync-paste"
            bind:this={pasteField}
            bind:value={pasted}
            class="scan__input"
            class:scan__input--invalid={pasteError || outcome?.kind === "invalid"}
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="Paste the link here"
            aria-invalid={pasteError || outcome?.kind === "invalid" ? "true" : undefined}
            aria-describedby={pasteError || outcome?.kind === "invalid"
              ? "sync-paste-error"
              : undefined}
            oninput={() => {
              pasteError = false;
            }}
          />
          <Button type="submit" disabled={pending}>Sync</Button>
        </div>
        {#if pasteError || outcome?.kind === "invalid"}
          <p id="sync-paste-error" class="scan__error">
            Hmm, that link doesn’t look quite right. Try scanning the code instead?
          </p>
        {/if}
      </form>
      {#if pending}
        <p class="follow-aside" role="status">
          <IconLoader2 class="inline size-4 animate-spin motion-reduce:animate-none" />
          Grabbing your save file…
        </p>
      {:else if outcome?.kind === "unreachable" || outcome?.kind === "rate-limited"}
        <StatusNote tone="warning">
          <p class="font-semibold">We can’t connect right now</p>
          <p>We’ll keep trying, or you can try again.</p>
        </StatusNote>
      {:else if outcome?.kind === "paused"}
        <StatusNote tone="warning">
          <p class="font-semibold">Sync is paused for now</p>
        </StatusNote>
      {:else if outcome?.kind === "unreadable" || outcome?.kind === "unsupported-version"}
        <StatusNote tone="warning">
          <p class="font-semibold">Your computer is having trouble reading your save file</p>
          <p>Your progress is safe! For more info, check Mistria Field Guide on your computer.</p>
        </StatusNote>
      {/if}
    </div>
  </SetupStep>
{/if}

{#if scanning}
  <QrScanner
    onclose={() => {
      scanning = false;
    }}
    onerror={(message) => {
      scanning = false;
      cameraError = message;
    }}
    onresult={handleScan}
  />
{/if}

<style>
  .scan {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .scan code {
    padding: 1px 4px;
    background: color-mix(in srgb, var(--color-paper) 80%, var(--color-ink-hairline) 14%);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  .scan__paste {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .scan__paste label {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .scan__row {
    display: flex;
    gap: 6px;
  }

  .scan__input {
    min-width: 0;
    min-height: 44px;
    flex: 1;
    padding: 6px 10px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 70%, transparent);
    background: var(--color-paper);
    font-family: var(--font-data);
    font-size: var(--text-sm);
  }

  .scan__input--invalid {
    border-color: var(--destructive);
  }

  .scan__error {
    color: var(--destructive);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .follow-note {
    display: flex;
    gap: 10px;
    padding: 14px;
    border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
    background: var(--color-paper-raised);
    font-family: var(--font-annotation);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .follow-note h2 {
    margin-bottom: 4px;
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 600;
  }

  .follow-note :global(.follow-note__icon) {
    width: 18px;
    height: 18px;
    flex: none;
    margin-top: 3px;
    color: var(--color-ink-muted);
  }

  .follow-note__progress {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    color: var(--color-ink-muted);
    font-size: var(--text-xs);
  }

  .follow-note__progress :global(svg) {
    width: 14px;
    height: 14px;
  }

  .follow-note__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .follow-aside {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }
</style>
