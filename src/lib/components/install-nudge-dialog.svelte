<script lang="ts">
  import SyncTagDialog from "#lib/components/sync/sync-tag-dialog.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    downloadProgressBackup,
    trackingReminders,
  } from "#lib/controllers/tracking-reminders.svelte.js";

  let open = $derived(trackingReminders.installOpen);
</script>

<SyncTagDialog
  bind:open
  title="Let’s keep your progress safe"
  body="Safari can clear your progress after seven days of Safari use without a visit here. Adding the field guide to your Home Screen gives it its own storage, so we’ll move your progress over with a backup."
  onOpenChange={(value) => {
    if (!value && trackingReminders.installOpen) trackingReminders.closeInstall();
  }}
  actions={[
    { label: "Later", onclick: () => trackingReminders.closeInstall() },
    {
      label: "I’ve installed it",
      onclick: () => trackingReminders.closeInstall(true),
      primary: true,
    },
  ]}
>
  <p>1. Download a backup of your progress first.</p>
  <Button variant="outline" onclick={downloadProgressBackup}>Export backup</Button>
  <p>2. Open Share, then choose Add to Home Screen. Open the field guide from its new icon.</p>
  <p>3. Open Data in the installed app and restore the backup you just downloaded.</p>
</SyncTagDialog>
