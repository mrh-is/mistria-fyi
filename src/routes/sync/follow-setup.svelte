<script lang="ts">
  import IconCamera from "@tabler/icons-svelte-runes/icons/camera";
  import IconClock from "@tabler/icons-svelte-runes/icons/clock";
  import IconLoader2 from "@tabler/icons-svelte-runes/icons/loader-2";
  import { onDestroy } from "svelte";

  import StatusNote from "#lib/components/status-note.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as m from "#lib/paraglide/messages.js";
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

  const scanBody = $derived(messageParts<"url">((slot) => m.sync_scan_body({ url: slot("url") })));

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
      <h2>{m.sync_waiting_title()}</h2>
      <p>{m.sync_waiting()}</p>
      <p class="follow-note__progress" role="status">
        <IconLoader2 class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {m.sync_waiting_progress()}
      </p>
    </div>
  </div>
  <p class="follow-aside">{m.sync_waiting_note()}</p>
{:else if outcome?.kind === "retired"}
  <div class="follow-note" role="status">
    <div>
      <h2>{m.sync_retired_title()}</h2>
      <p>{m.sync_retired_body()}</p>
      <div class="follow-note__actions">
        <Button
          size="sm"
          onclick={() => {
            scanning = true;
          }}
        >
          <IconCamera />
          {m.sync_retired_action()}
        </Button>
        {#if showStop}
          <Button size="sm" variant="outline" onclick={onstop}>{m.sync_retired_stop()}</Button>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <SetupStep numeral="i" title={m.sync_scan_title()} state="active">
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
        {m.sync_scan()}
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
        <label for="sync-paste">{m.sync_scan_paste()}</label>
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
            placeholder={m.sync_scan_paste_placeholder()}
            aria-invalid={pasteError || outcome?.kind === "invalid" ? "true" : undefined}
            aria-describedby={pasteError || outcome?.kind === "invalid"
              ? "sync-paste-error"
              : undefined}
            oninput={() => {
              pasteError = false;
            }}
          />
          <Button type="submit" disabled={pending}>{m.sync_scan_submit()}</Button>
        </div>
        {#if pasteError || outcome?.kind === "invalid"}
          <p id="sync-paste-error" class="scan__error">{m.sync_scan_bad()}</p>
        {/if}
      </form>
      {#if pending}
        <p class="follow-aside" role="status">
          <IconLoader2 class="inline size-4 animate-spin motion-reduce:animate-none" />
          {m.sync_opening()}
        </p>
      {:else if outcome?.kind === "unreachable" || outcome?.kind === "rate-limited"}
        <StatusNote tone="warning">
          <p class="font-semibold">{m.sync_unreachable_title()}</p>
          <p>{m.sync_unreachable_body()}</p>
        </StatusNote>
      {:else if outcome?.kind === "paused"}
        <StatusNote tone="warning">
          <p class="font-semibold">{m.sync_paused_title()}</p>
        </StatusNote>
      {:else if outcome?.kind === "unreadable" || outcome?.kind === "unsupported-version"}
        <StatusNote tone="warning">
          <p class="font-semibold">{m.sync_unreadable_away_title()}</p>
          <p>{m.sync_unreadable_away_body()}</p>
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
