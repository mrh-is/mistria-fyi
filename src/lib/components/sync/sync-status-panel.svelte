<script lang="ts">
  import IconSettings from "@tabler/icons-svelte-runes/icons/settings";

  import StatusNote from "#lib/components/status-note.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { getName } from "#lib/data/names.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
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
    return m.source_date_label_year({
      day: String(date.day),
      season: getName("ui", date.season, page.data.locale),
      year: String(date.year),
    });
  });
</script>

<div class="sync-panel">
  <SyncTroubleNote />

  {#if syncReceiver.status.kind === "unreachable"}
    <StatusNote tone="warning">
      <p class="font-semibold">{m.sync_unreachable_title()}</p>
      <p>{m.sync_unreachable_body()}</p>
      <Button
        class="mt-2"
        size="sm"
        variant="outline"
        onclick={() => {
          syncReceiver.refresh();
        }}
      >
        {m.sync_try_again()}
      </Button>
    </StatusNote>
  {/if}

  <dl class="sync-panel__facts">
    <dt>{m.sync_panel_from()}</dt>
    <dd>{lane?.kind === "computer" ? m.sync_panel_from_here() : m.sync_panel_from_computer()}</dd>
    {#if lastSave}
      <dt>{m.sync_panel_last()}</dt>
      <dd>{lastSave}</dd>
    {/if}
    {#if gameDate}
      <dt>{m.sync_panel_date()}</dt>
      <dd>{gameDate}</dd>
    {/if}
  </dl>

  {#if lane?.kind === "computer"}
    <p class="sync-panel__note">{m.sync_status_keep_open()}</p>
  {/if}

  <a class="sync-panel__link" href={localizedHref("data")}>
    <IconSettings class="size-4" aria-hidden="true" />
    {m.sync_panel_settings()}
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
