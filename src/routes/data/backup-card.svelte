<script lang="ts">
  import IconFileUpload from "@tabler/icons-svelte-runes/icons/file-upload";
  import IconUpload from "@tabler/icons-svelte-runes/icons/upload";

  import { Button } from "$lib/components/ui/button/index.js";
  import * as m from "$lib/paraglide/messages.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import DataCard from "./data-card.svelte";

  import type { ImportErrorKind } from "$lib/stores/user-state.svelte.js";

  const ERROR_MESSAGES: Record<ImportErrorKind, string> = {
    "invalid-fields": m.backup_error_invalid_fields(),
    "malformed-json": m.backup_error_malformed_json(),
    "unsupported-version": m.backup_error_unsupported_version(),
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
    input.setAttribute("aria-label", m.backup_choose_file_aria());
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      restoring = true;
      restoreError = "";
      restoreStatus = m.backup_restoring_status();
      try {
        const text = await file.text();
        const result = userState.importState(text);
        if (!result.ok) {
          restoreStatus = "";
          restoreError = ERROR_MESSAGES[result.error];
        } else {
          restoreStatus = m.backup_restored_success();
        }
      } catch {
        restoreStatus = "";
        restoreError = m.backup_could_not_read();
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
    <div class="sr-only" role="status" aria-live="polite">{restoreStatus}</div>
    <div class="sr-only">
      {#if restoreError}<span role="alert">{restoreError}</span>{/if}
    </div>
    {#if restoreStatus}<p class="text-sm text-muted-foreground">{restoreStatus}</p>{/if}
    {#if restoreError}<p class="text-sm text-destructive">{restoreError}</p>{/if}
  </div>
</DataCard>
