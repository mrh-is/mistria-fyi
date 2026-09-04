<script lang="ts">
  import { FileUp, Upload } from "@lucide/svelte";

  import { Button } from "$lib/components/ui/button/index.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SettingsCard from "./settings-card.svelte";

  import type { ImportErrorKind } from "$lib/stores/user-state.svelte.js";

  const ERROR_MESSAGES: Record<ImportErrorKind, string> = {
    "invalid-fields":
      "This backup is missing required data or contains invalid fields. It may be corrupted or from a different app.",
    "malformed-json":
      "This file is not valid JSON. Make sure you selected an unmodified backup file.",
    "unsupported-version":
      "This backup was created by a newer version of Mistria Field Guide. Update the app and try again.",
  };

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let restoring = $state(false);
  let restoreError = $state("");
  let restoreStatus = $state("");

  function handleExport() {
    const json = userState.exportState();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mistria-field-guide-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.name = "backup-file";
    input.setAttribute("aria-label", "Choose a backup file to restore");
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      restoring = true;
      restoreError = "";
      restoreStatus = "Restoring backup…";
      try {
        const text = await file.text();
        const result = userState.importState(text);
        if (!result.ok) {
          restoreStatus = "";
          restoreError = ERROR_MESSAGES[result.error];
        } else {
          restoreStatus = "Backup restored successfully.";
        }
      } catch {
        restoreStatus = "";
        restoreError = "Could not read this backup file.";
      } finally {
        restoring = false;
      }
    };
    input.className = "sr-only";
    input.oncancel = () => {
      input.remove();
    };
    document.body.append(input);
    input.click();
  }
</script>

<SettingsCard bind:open title="Backup & Restore" summary="Export or restore all tracker data.">
  <div class="flex flex-col gap-2">
    <Button variant="outline" onclick={handleExport}>
      <FileUp />
      Export backup
    </Button>
    <Button
      variant="outline"
      disabled={restoring}
      aria-busy={restoring}
      onclick={handleImportBackup}
    >
      <Upload />
      Restore from backup
    </Button>
    <div class="sr-only" role="status" aria-live="polite">{restoreStatus}</div>
    <div class="sr-only">
      {#if restoreError}<span role="alert">{restoreError}</span>{/if}
    </div>
    {#if restoreStatus}<p class="text-sm text-muted-foreground">{restoreStatus}</p>{/if}
    {#if restoreError}<p class="text-sm text-destructive">{restoreError}</p>{/if}
  </div>
</SettingsCard>
