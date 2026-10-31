<script lang="ts">
  import IconFileAlert from "@tabler/icons-svelte-runes/icons/file-alert";
  import IconFileUpload from "@tabler/icons-svelte-runes/icons/file-upload";
  import IconUpload from "@tabler/icons-svelte-runes/icons/upload";

  import { Button } from "#lib/components/ui/button/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { holdUpdatesWhile } from "#lib/pwa/update-holds.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { BACKUP_FILE_PREFIX, downloadJson } from "#lib/utils/download.js";

  import DataCard from "./data-card.svelte";

  import type { BackupRestoreErrorKind } from "#lib/stores/user-state.svelte.js";

  const ERROR_MESSAGES: Record<BackupRestoreErrorKind, string> = {
    "invalid-fields": m.backup_error_invalid_fields(),
    "malformed-json": m.backup_error_malformed_json(),
    "newer-version": m.backup_error_newer_version(),
  };

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let restoring = $state(false);
  let restoreError = $state("");
  let restoreStatus = $state("");

  // An app update's reload waits until a restore has finished applying.
  $effect(() => holdUpdatesWhile(restoring));

  function handleExport() {
    downloadJson(userState.exportBackup(), BACKUP_FILE_PREFIX);
  }

  function handleDownloadUnreadable() {
    const data = userState.unreadableData;
    if (data !== null) downloadJson(data, "mistria-field-guide-unreadable");
  }

  function handleImportBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.name = "backup-file";
    input.setAttribute("aria-label", m.backup_choose_file_aria());
    input.accept = ".json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      restoring = true;
      restoreError = "";
      restoreStatus = m.backup_restoring_status();
      try {
        const text = await file.text();
        const result = userState.restoreBackup(text);
        if (result.ok) {
          restoreStatus = m.backup_restored_success();
        } else {
          restoreStatus = "";
          restoreError = ERROR_MESSAGES[result.error];
        }
      } catch {
        restoreStatus = "";
        restoreError = m.backup_could_not_read();
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

<DataCard bind:open title={m.backup_card_title()} summary={m.backup_card_summary()}>
  <div class="flex flex-col gap-2">
    <Button variant="outline" onclick={handleExport}>
      <IconFileUpload />
      {m.backup_export_action()}
    </Button>
    <Button
      variant="outline"
      disabled={restoring}
      aria-busy={restoring}
      onclick={handleImportBackup}
    >
      <IconUpload />
      {m.backup_restore_action()}
    </Button>
    {#if userState.unreadableData !== null}
      <Button variant="outline" onclick={handleDownloadUnreadable}>
        <IconFileAlert />
        {m.backup_download_unreadable_action()}
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
