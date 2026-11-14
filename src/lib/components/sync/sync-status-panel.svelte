<script lang="ts">
  import IconSettings from "@tabler/icons-svelte-runes/icons/settings";
  import IconUpload from "@tabler/icons-svelte-runes/icons/upload";

  import StatusNote from "#lib/components/status-note.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { getName } from "#lib/data/names.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { syncCourier } from "#lib/sync/courier-state.svelte.js";
  import { syncReceiver } from "#lib/sync/receiver-state.svelte.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  import SyncTroubleNote from "./sync-trouble-note.svelte";

  const lane = $derived(userState.syncLane);
  const freshness = $derived(userState.syncFreshness);
  const lastSave = $derived(
    freshness
      ? new Intl.DateTimeFormat(page.data.locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(freshness.modified)
      : undefined,
  );
  const gameDate = $derived.by(() => {
    const date = freshness?.gameDate;
    if (!date) return undefined;
    return `${getName("ui", date.season, page.data.locale)} ${String(date.day)}, Year ${String(date.year)}`;
  });
</script>

<div class="sync-panel">
  <SyncTroubleNote />

  {#if syncReceiver.status.kind === "unreachable"}
    <StatusNote tone="warning">
      <p class="font-semibold">We can’t connect right now</p>
      <p>We’ll keep trying, or you can try again.</p>
      <Button
        class="mt-2"
        size="sm"
        variant="outline"
        onclick={() => {
          syncReceiver.refresh();
        }}
      >
        <!-- @wc-context: sync try again -->Try again
      </Button>
    </StatusNote>
  {/if}

  <dl class="sync-panel__facts">
    <dt>Save file from</dt>
    <dd>{lane?.kind === "computer" ? "This computer" : "Your gaming computer"}</dd>
    {#if lastSave}
      <dt>Last save file</dt>
      <dd>{lastSave}</dd>
    {/if}
    {#if gameDate}
      <dt>In-game date</dt>
      <dd>{gameDate}</dd>
    {/if}
  </dl>

  {#if lane?.kind === "computer" && (syncCourier.status.source === "file" || syncCourier.status.source === "none")}
    <a class="sync-panel__link" href={localizedHref("data")}>
      <IconUpload class="size-4" aria-hidden="true" />
      Drop in your latest save file
    </a>
  {:else if lane?.kind === "computer"}
    <p class="sync-panel__note">Keep this tab open while you play so we can sync your save file.</p>
  {/if}

  <a class="sync-panel__link" href={localizedHref("data")}>
    <IconSettings class="size-4" aria-hidden="true" />
    Sync & data settings
  </a>
</div>

<style>
  .sync-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px 14px;
  }

  .sync-panel__facts {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 8px 14px;
    font-size: var(--text-xs);
  }

  .sync-panel__facts dt {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
  }

  .sync-panel__facts dd {
    overflow-wrap: anywhere;
    font-family: var(--font-body);
    text-align: end;
  }

  .sync-panel__note {
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs);
  }

  .sync-panel__link {
    display: flex;
    min-height: 44px;
    align-items: center;
    gap: 8px;
    margin-block-end: -8px;
    border-top: 1px solid color-mix(in srgb, var(--color-ink-hairline) 34%, transparent);
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
  }

  .sync-panel__link:is(:hover, :focus-visible) {
    color: var(--color-ink);
  }
</style>
