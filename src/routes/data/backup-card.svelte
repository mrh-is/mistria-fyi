<script lang="ts">
  import IconFileAlert from "@tabler/icons-svelte-runes/icons/file-alert";
  import IconFileUpload from "@tabler/icons-svelte-runes/icons/file-upload";
  import IconHistory from "@tabler/icons-svelte-runes/icons/history";
  import IconUpload from "@tabler/icons-svelte-runes/icons/upload";

  import SyncTagDialog from "#lib/components/sync/sync-tag-dialog.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { downloadProgressBackup } from "#lib/controllers/tracking-reminders.svelte.js";
  import { progressBackup } from "#lib/progress/index.js";
  import { holdUpdatesWhile } from "#lib/pwa/update-holds.js";
  import { downloadJson } from "#lib/utils/download.js";
  import { page } from "$app/state";

  import DataCard from "./data-card.svelte";

  import type { BackupRestoreErrorKind } from "#lib/progress/index.js";

  const ERROR_MESSAGES: Record<BackupRestoreErrorKind, string> = {
    "invalid-fields":
      "This backup is missing some data, so we left your progress as it was. It might be damaged, or from a different app.",
    "malformed-json":
      "This doesn’t look like a backup file, so we left your progress as it was. Make sure you picked one you downloaded from here.",
    "newer-version":
      "A time traveler! That backup seems to be from a future version of the field guide. To be safe, we left your progress as it was. Reload this page to get the latest update, then try again.",
  };

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let restoring = $state(false);
  let restoreError = $state("");
  let restoreStatus = $state("");

  // An app update's reload waits until a restore has finished applying.
  $effect(() => holdUpdatesWhile(restoring));

  let farmBackupOpen = $state(false);
  const farmBackupLabel = $derived.by(() => {
    const kept = progressBackup.farmSwitchBackup;
    if (!kept) return undefined;
    const date = new Intl.DateTimeFormat(page.data.locale, { dateStyle: "medium" }).format(
      kept.savedAt,
    );
    return kept.farmName
      ? `Backup of ${kept.farmName}, from ${date}`
      : `Backup of your last farm, from ${date}`;
  });

  function restoreFarmBackup(): void {
    farmBackupOpen = false;
    restoreError = "";
    const result = progressBackup.restoreFarmSwitchBackup();
    if (result.ok) {
      restoreStatus = "Restored that backup.";
    } else {
      restoreStatus = "";
      restoreError = ERROR_MESSAGES[result.error];
    }
  }

  function handleExport() {
    downloadProgressBackup();
  }

  function handleDownloadUnreadable() {
    const data = progressBackup.unreadableData;
    if (data !== null) downloadJson(data, "mistria-field-guide-unreadable");
  }

  function handleImportBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.name = "backup-file";
    input.setAttribute("aria-label", "Choose a backup file to restore");
    input.accept = ".json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      restoring = true;
      restoreError = "";
      restoreStatus = "Restoring backup…";
      try {
        const text = await file.text();
        const result = progressBackup.restoreBackup(text);
        if (result.ok) {
          restoreStatus = "All set, your backup is restored!";
        } else {
          restoreStatus = "";
          restoreError = ERROR_MESSAGES[result.error];
        }
      } catch {
        restoreStatus = "";
        restoreError =
          "We couldn’t open that file, so we left your progress as it was. Make sure you picked a backup you downloaded from here.";
      } finally {
        restoring = false;
      }
    });
    input.className = "sr-only";
    input.addEventListener("cancel", () => {
      input.remove();
    });
    document.body.append(input);
    input.click();
  }
</script>

<DataCard bind:open title="Backup & restore" summary="Export or restore all your field guide data.">
  <div class="flex flex-col gap-2">
    <Button variant="outline" onclick={handleExport}>
      <IconFileUpload />
      Export backup
    </Button>
    <Button
      variant="outline"
      disabled={restoring}
      aria-busy={restoring}
      onclick={handleImportBackup}
    >
      <IconUpload />
      Restore from backup
    </Button>
    {#if farmBackupLabel}
      <Button
        variant="outline"
        onclick={() => {
          farmBackupOpen = true;
        }}
      >
        <IconHistory />
        {farmBackupLabel}
      </Button>
    {/if}
    {#if progressBackup.unreadableData !== null}
      <Button variant="outline" onclick={handleDownloadUnreadable}>
        <IconFileAlert />
        Download unreadable data
      </Button>
    {/if}
    <div class="sr-only" role="status" aria-live="polite">{restoreStatus}</div>
    <div class="sr-only">
      {#if restoreError}<span role="alert">{restoreError}</span>{/if}
    </div>
    {#if restoreStatus}<p class="text-sm text-muted-foreground">{restoreStatus}</p>{/if}
    {#if restoreError}<p class="text-sm text-destructive">{restoreError}</p>{/if}
  </div>
</DataCard>

<SyncTagDialog
  bind:open={farmBackupOpen}
  title="Restore this backup?"
  body="It replaces what’s on this device. You’ll stay synced, so your next save file still applies with the usual rules."
  actions={[
    {
      label: "Cancel",
      onclick: () => {
        farmBackupOpen = false;
      },
    },
    { label: "Restore it", onclick: restoreFarmBackup, primary: true },
  ]}
/>
