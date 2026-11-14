<script lang="ts">
  import IconCamera from "@tabler/icons-svelte-runes/icons/camera";
  import IconLoader2 from "@tabler/icons-svelte-runes/icons/loader-2";
  import IconPlayerPause from "@tabler/icons-svelte-runes/icons/player-pause";
  import IconQrcode from "@tabler/icons-svelte-runes/icons/qrcode";
  import IconRefresh from "@tabler/icons-svelte-runes/icons/refresh";
  import IconSparkles from "@tabler/icons-svelte-runes/icons/sparkles";
  import { onMount } from "svelte";

  import StatusNote from "#lib/components/status-note.svelte";
  import SaveDrop from "#lib/components/sync/save-drop.svelte";
  import SyncTagDialog from "#lib/components/sync/sync-tag-dialog.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { getName } from "#lib/data/names.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncCourier } from "#lib/sync/courier-state.svelte.js";
  import { retireStatus } from "#lib/sync/retire-status.svelte.js";
  import { guessPlatform } from "#lib/sync/save-folders.js";
  import { makeNewCode, resumeStoppedRetires, stopSyncing } from "#lib/sync/sharing.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  import CodeArea from "../sync/code-area.svelte";
  import DataCard from "./data-card.svelte";

  const lane = $derived(userState.syncLane);
  let open = $state(false);
  let wasSyncing = false;

  const oldCodeActive = $derived(userState.syncPendingRetires.length > 0);
  const oldCodeStuck = $derived(retireStatus.stuck(userState.syncPendingRetires));

  // Stored progress loads after the page mounts, so the card opens once a lane appears, or once
  // an old code that still works does, which can outlast the lane.
  $effect(() => {
    const syncing = lane !== undefined || oldCodeActive;
    if (syncing && !wasSyncing) open = true;
    wasSyncing = syncing;
  });

  // Finishing has nothing to see, since the status just goes, so it's only announced.
  let oldCodeDone = $state(false);
  let wasOldCodeActive = false;
  $effect(() => {
    if (oldCodeActive) oldCodeDone = false;
    else if (wasOldCodeActive) oldCodeDone = true;
    wasOldCodeActive = oldCodeActive;
  });

  // The stuck note's own alert speaks for itself.
  const oldCodeAnnouncement = $derived.by(() => {
    if (oldCodeDone) return "Your old code is off.";
    if (!oldCodeActive || working || oldCodeStuck) return "";
    return `${"Turning off your old code…"} ${"It still works until this finishes."}`;
  });

  onMount(() => {
    void resumeStoppedRetires();
  });

  let showCode = $state(false);
  let newCodeOpen = $state(false);
  let stopOpen = $state(false);
  let newCodeFailed = $state(false);
  let working = $state(false);

  const courier = $derived(syncCourier.status);
  // Where the save file isn't watched, this card takes each new one.
  const takesSaves = $derived(courier.source === "file" || courier.source === "none");
  const platform = guessPlatform();
  const lastImport = $derived(userState.state.lastImport);
  const lastSaveAt = $derived(userState.syncFreshness?.modified ?? lastImport?.importedAt);
  const lastSaveTime = $derived(
    lastSaveAt === undefined
      ? undefined
      : new Intl.DateTimeFormat(page.data.locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(lastSaveAt),
  );
  const gameDate = $derived.by(() => {
    const date = userState.syncFreshness?.gameDate;
    if (!date) return undefined;
    return `${getName("ui", date.season, page.data.locale)} ${String(date.day)}, Year ${String(date.year)}`;
  });

  async function confirmNewCode(): Promise<void> {
    newCodeOpen = false;
    working = true;
    const result = await makeNewCode();
    working = false;
    newCodeFailed = result.kind !== "shared";
    if (!newCodeFailed) showCode = true;
  }

  async function confirmStop(): Promise<void> {
    stopOpen = false;
    showCode = false;
    await stopSyncing();
  }
</script>

<!-- Always here, so a screen reader announces each change to it. -->
<div class="sr-only" role="status">{oldCodeAnnouncement}</div>

<DataCard bind:open title="Save file sync" summary="Sync your save file from your gaming computer.">
  {#if oldCodeActive && !working}
    <div class="sync-card__old-code">
      {#if oldCodeStuck}
        <StatusNote tone="warning"
          >We couldn’t turn off your old code yet. We’ll try again next time you’re here.</StatusNote
        >
      {:else}
        <div class="sync-card__turning-off" aria-hidden="true">
          <IconLoader2 class="size-4 animate-spin motion-reduce:animate-none" />
          <div>
            <p class="sync-card__turning-off-title">Turning off your old code…</p>
            <p>It still works until this finishes.</p>
          </div>
        </div>
      {/if}
    </div>
  {/if}
  {#if lane === undefined}
    <div class="sync-card">
      <p class="sync-card__note">
        Read your save file here, or scan a code from your gaming computer.
      </p>
      <Button href={localizedHref("sync")} class="w-full">
        <IconSparkles />
        Sync from my farm automagically
      </Button>
    </div>
  {:else}
    <div class="sync-card">
      <dl class="sync-card__facts">
        {#if lane.kind === "computer" && courier.fileName}
          <dt>Save file</dt>
          <dd>{courier.fileName}</dd>
        {:else}
          <dt>Save file from</dt>
          <dd>
            {lane.kind === "computer" ? "This computer" : "Your gaming computer"}
          </dd>
        {/if}
        {#if lastSaveTime}
          <dt>Last save file</dt>
          <dd>{lastSaveTime}</dd>
        {/if}
        {#if gameDate}
          <dt>In-game date</dt>
          <dd>{gameDate}</dd>
        {/if}
        {#if lastImport?.playerName}
          <dt>Farmer</dt>
          <dd>{lastImport.playerName}</dd>
        {/if}
        {#if lastImport?.farmName}
          <dt>Farm</dt>
          <dd>{lastImport.farmName}</dd>
        {/if}
      </dl>

      {#if lane.kind === "computer" && takesSaves}
        <p class="sync-card__note">
          Whenever you’re done playing, drop your save file in again and we’ll sync it.
        </p>
        <div class="sync-card__drop">
          <SaveDrop label="Drop in your latest save file" onsource={syncCourier.offer} {platform} />
        </div>
      {:else if lane.kind === "computer"}
        <p class="sync-card__note">
          Keep this tab open while you play so we can sync your save file.
        </p>
      {/if}

      {#if newCodeFailed}
        <StatusNote tone="warning"
          >We couldn’t make a new code right now, so your old one still works. Try again in a bit.</StatusNote
        >
      {/if}

      {#if showCode && lane.kind === "computer"}
        <div class="sync-card__code">
          <CodeArea linkOrigin={page.url.origin} revealed />
        </div>
      {/if}

      <div class="sync-card__actions">
        {#if lane.kind === "computer"}
          <Button
            variant="outline"
            onclick={() => {
              showCode = !showCode;
            }}
            aria-expanded={showCode}
          >
            <IconQrcode />
            Show code
          </Button>
          <p>Add your phone or another device.</p>
          {#if lane.code}
            <Button
              variant="outline"
              disabled={working}
              onclick={() => {
                newCodeOpen = true;
              }}
            >
              <IconRefresh />
              Make a new code
            </Button>
            <p>Stops the old code, in case it ended up on stream or somewhere you didn’t mean.</p>
          {/if}
        {:else}
          <Button variant="outline" href={localizedHref("sync")}>
            <IconCamera />
            Scan a different code
          </Button>
          <p>Sync a save file from a different computer.</p>
        {/if}
        <Button
          variant="outline"
          onclick={() => {
            stopOpen = true;
          }}
        >
          <IconPlayerPause />
          <!-- @wc-context: sync stop -->Stop syncing
        </Button>
        <p>Go back to checking things off by hand. Your progress stays.</p>
      </div>
    </div>
  {/if}
</DataCard>

<SyncTagDialog
  bind:open={newCodeOpen}
  title="Make a new code"
  body="Showed your code on stream? No problem. A new code replaces the old one, which takes a moment to turn off, so your other devices will need to scan again."
  actions={[
    {
      label: /* @wc-context: sync new code cancel */ "Never mind",
      onclick: () => {
        newCodeOpen = false;
      },
    },
    { label: "Make a new code", onclick: () => void confirmNewCode(), primary: true },
  ]}
/>

<SyncTagDialog
  bind:open={stopOpen}
  title="Stop syncing?"
  body={lane?.kind === "computer"
    ? "Your progress stays right here, and you’ll check things off by hand from now on. Your other devices will stop getting your save file. If you sync your save file again later, it’ll start fresh."
    : "Your progress stays right here, and you’ll check things off by hand from now on. If you sync your save file again later, it’ll start fresh."}
  actions={[
    {
      label: "Cancel",
      onclick: () => {
        stopOpen = false;
      },
    },
    {
      label: /* @wc-context: sync stop confirm */ "Stop syncing",
      onclick: () => void confirmStop(),
      primary: true,
    },
  ]}
/>

<style>
  .sync-card__old-code {
    margin-block-end: 12px;
  }

  .sync-card__turning-off {
    display: flex;
    gap: 8px;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .sync-card__turning-off :global(svg) {
    flex: none;
    margin-block-start: 1px;
  }

  .sync-card__turning-off-title {
    color: var(--color-ink);
    font-weight: 600;
  }

  .sync-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sync-card__facts {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 3px 14px;
    font-size: var(--text-xs);
  }

  .sync-card__facts dt {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
  }

  .sync-card__facts dd {
    overflow-wrap: anywhere;
    font-family: var(--font-body);
  }

  .sync-card__note {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .sync-card__code {
    margin-inline: -1rem;
  }

  .sync-card__drop {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Each action carries a line saying what it's for. */
  .sync-card__actions {
    display: grid;
    grid-template-columns: minmax(150px, max-content) minmax(0, 1fr);
    align-items: center;
    gap: 8px 12px;
  }

  .sync-card__actions p {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    line-height: 1.35;
  }

  @media (max-width: 420px) {
    .sync-card__actions {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .sync-card__actions p {
      margin-bottom: 8px;
    }
  }
</style>
