<script lang="ts">
  import IconCamera from "@tabler/icons-svelte-runes/icons/camera";
  import IconPlayerPause from "@tabler/icons-svelte-runes/icons/player-pause";
  import IconQrcode from "@tabler/icons-svelte-runes/icons/qrcode";
  import IconRefresh from "@tabler/icons-svelte-runes/icons/refresh";
  import IconSparkles from "@tabler/icons-svelte-runes/icons/sparkles";

  import StatusNote from "#lib/components/status-note.svelte";
  import SaveDrop from "#lib/components/sync/save-drop.svelte";
  import SyncTagDialog from "#lib/components/sync/sync-tag-dialog.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { getName } from "#lib/data/names.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncCourier } from "#lib/sync/courier-state.svelte.js";
  import { guessPlatform } from "#lib/sync/save-folders.js";
  import { makeNewCode, stopSyncing } from "#lib/sync/sharing.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  import CodeArea from "../sync/code-area.svelte";
  import DataCard from "./data-card.svelte";

  const lane = $derived(userState.syncLane);
  let open = $state(false);
  let wasSyncing = false;

  // Stored progress loads after the page mounts, so the card opens once a lane appears.
  $effect(() => {
    const syncing = lane !== undefined;
    if (syncing && !wasSyncing) open = true;
    wasSyncing = syncing;
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
    return m.source_date_label_year({
      day: String(date.day),
      season: getName("ui", date.season, page.data.locale),
      year: String(date.year),
    });
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

<DataCard bind:open title={m.sync_card_title()} summary={m.sync_card_summary()}>
  {#if lane === undefined}
    <div class="sync-card">
      <p class="sync-card__note">{m.sync_card_setup_sub()}</p>
      <Button href={localizedHref("sync")} class="w-full">
        <IconSparkles />
        {m.sync_home_sync()}
      </Button>
    </div>
  {:else}
    <div class="sync-card">
      <dl class="sync-card__facts">
        {#if lane.kind === "computer" && courier.fileName}
          <dt>{m.sync_panel_file()}</dt>
          <dd>{courier.fileName}</dd>
        {:else}
          <dt>{m.sync_panel_from()}</dt>
          <dd>
            {lane.kind === "computer" ? m.sync_panel_from_here() : m.sync_panel_from_computer()}
          </dd>
        {/if}
        {#if lastSaveTime}
          <dt>{m.sync_panel_last()}</dt>
          <dd>{lastSaveTime}</dd>
        {/if}
        {#if gameDate}
          <dt>{m.sync_panel_date()}</dt>
          <dd>{gameDate}</dd>
        {/if}
        {#if lastImport?.playerName}
          <dt>{m.sync_panel_farmer()}</dt>
          <dd>{lastImport.playerName}</dd>
        {/if}
        {#if lastImport?.farmName}
          <dt>{m.sync_panel_farm()}</dt>
          <dd>{lastImport.farmName}</dd>
        {/if}
      </dl>

      {#if lane.kind === "computer" && takesSaves}
        <p class="sync-card__note">{m.sync_done_redrop()}</p>
        <div class="sync-card__drop">
          <SaveDrop label={m.sync_redrop_label()} onsource={syncCourier.offer} {platform} />
        </div>
      {:else if lane.kind === "computer"}
        <p class="sync-card__note">{m.sync_status_keep_open()}</p>
      {/if}

      {#if newCodeFailed}
        <StatusNote tone="warning">{m.sync_new_code_failed()}</StatusNote>
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
            {m.sync_phone_show()}
          </Button>
          <p>{m.sync_show_code_sub()}</p>
          {#if lane.code}
            <Button
              variant="outline"
              disabled={working}
              onclick={() => {
                newCodeOpen = true;
              }}
            >
              <IconRefresh />
              {m.sync_new_code()}
            </Button>
            <p>{m.sync_new_code_sub()}</p>
          {/if}
        {:else}
          <Button variant="outline" href={localizedHref("sync")}>
            <IconCamera />
            {m.sync_scan_other()}
          </Button>
          <p>{m.sync_scan_other_sub()}</p>
        {/if}
        <Button
          variant="outline"
          onclick={() => {
            stopOpen = true;
          }}
        >
          <IconPlayerPause />
          {m.sync_stop()}
        </Button>
        <p>{m.sync_stop_sub()}</p>
      </div>
    </div>
  {/if}
</DataCard>

<SyncTagDialog
  bind:open={newCodeOpen}
  title={m.sync_new_code()}
  body={m.sync_new_code_body()}
  actions={[
    {
      label: m.sync_new_code_cancel(),
      onclick: () => {
        newCodeOpen = false;
      },
    },
    { label: m.sync_new_code_confirm(), onclick: () => void confirmNewCode(), primary: true },
  ]}
/>

<SyncTagDialog
  bind:open={stopOpen}
  title={m.sync_stop_title()}
  body={lane?.kind === "computer" ? m.sync_stop_body_computer() : m.sync_stop_body()}
  actions={[
    {
      label: m.sync_stop_cancel(),
      onclick: () => {
        stopOpen = false;
      },
    },
    { label: m.sync_stop_confirm(), onclick: () => void confirmStop(), primary: true },
  ]}
/>

<style>
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
