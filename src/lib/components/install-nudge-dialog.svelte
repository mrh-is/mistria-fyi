<script lang="ts">
  import SyncTagDialog from "#lib/components/sync/sync-tag-dialog.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    downloadProgressBackup,
    trackingReminders,
  } from "#lib/controllers/tracking-reminders.svelte.js";
  import * as m from "#lib/ui-messages/messages.js";

  let open = $derived(trackingReminders.installOpen);
</script>

<SyncTagDialog
  bind:open
  title={m.tracking_install_title()}
  body={m.tracking_install_body()}
  onOpenChange={(value) => {
    if (!value && trackingReminders.installOpen) trackingReminders.closeInstall();
  }}
  actions={[
    { label: m.tracking_install_later(), onclick: () => trackingReminders.closeInstall() },
    {
      label: m.tracking_install_done(),
      onclick: () => trackingReminders.closeInstall(true),
      primary: true,
    },
  ]}
>
  <p>{m.tracking_install_backup()}</p>
  <Button variant="outline" onclick={downloadProgressBackup}>{m.backup_export_action()}</Button>
  <p>{m.tracking_install_add()}</p>
  <p>{m.tracking_install_restore()}</p>
</SyncTagDialog>
