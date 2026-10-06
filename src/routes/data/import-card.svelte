<script lang="ts">
  import IconCheck from "@tabler/icons-svelte-runes/icons/check";
  import IconCopy from "@tabler/icons-svelte-runes/icons/copy";
  import IconDeviceDesktop from "@tabler/icons-svelte-runes/icons/device-desktop";
  import IconUpload from "@tabler/icons-svelte-runes/icons/upload";

  import DialogCloseButton from "#lib/components/dialog-close-button.svelte";
  import StatusNote from "#lib/components/status-note.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Separator } from "#lib/components/ui/separator/index.js";
  import {
    extractSaveProgress,
    parseExtractedSaveFiles,
    SavArchiveError,
    unpackSavFile,
  } from "#lib/engine/import-save.js";
  import * as m from "#lib/paraglide/messages.js";
  import { totalMergeCounts } from "#lib/presentation/merge-labels.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import DataCard from "./data-card.svelte";
  import {
    formatExtractedSaveFilesError,
    formatSavArchiveError,
    formatSaveImportWarning,
  } from "./data-error-messages.js";
  import MergeSummary from "./merge-summary.svelte";

  import type { SaveImportReport, SaveImportWarning } from "#lib/engine/import-save.js";

  let {
    onScrollToTransfer,
    open = $bindable(false),
  }: { onScrollToTransfer?: () => void; open?: boolean } = $props();

  // ── Desktop detection (simple heuristic) ──
  let isDesktop = $derived(
    typeof globalThis.matchMedia === "function" &&
      globalThis.matchMedia("(min-width: 768px)").matches,
  );

  // ── Import state ──
  let importResult = $state<null | SaveImportReport>(null);
  let importError = $state<null | string>(null);
  let importErrorDetails = $state<string[]>([]);
  let showSavFallbackHelp = $state(false);
  let importing = $state(false);
  let importStatus = $state("");
  let filesUsed = $state<string[]>([]);

  // ── Drag-and-drop state ──
  let dragCounter = $state(0);
  let dragging = $derived(dragCounter > 0);

  // ── Hidden file input ref ──
  let fileInput = $state<HTMLInputElement | null>(null);

  // ── Save location dialog ──
  const SAV_PATH = String.raw`%LOCALAPPDATA%\FieldsOfMistria\saves`;
  let copied = $state(false);

  async function copyPathAsync(): Promise<void> {
    await navigator.clipboard.writeText(SAV_PATH);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  function copyPath() {
    void copyPathAsync();
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragCounter--;
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragCounter = 0;
    const files = e.dataTransfer?.files;
    if (files?.length) {
      void importFiles([...files]);
    }
  }

  async function importFiles(files: File[] | null) {
    if (!files || files.length === 0) return;

    importing = true;
    importResult = null;
    importError = null;
    importErrorDetails = [];
    showSavFallbackHelp = false;
    importStatus = "";
    filesUsed = [];

    try {
      // Check if user selected a .sav file
      const savFile = [...files].find((file) => isSavFile(file));

      let bundle;
      let parseWarnings: SaveImportWarning[] = [];
      if (savFile) {
        importStatus = m.import_status_unpacking();
        try {
          bundle = await unpackSavFile(savFile);
        } catch (error) {
          importError =
            error instanceof SavArchiveError
              ? formatSavArchiveError(error.detail)
              : m.import_error_unexpected();
          showSavFallbackHelp = true;
          return;
        }
      } else {
        const result = await parseExtractedSaveFiles(files);
        if (result.error || !result.bundle) {
          importError = result.error
            ? formatExtractedSaveFilesError(result.error)
            : m.import_error_parse_failed();
          if (result.error?.code === "no-valid-files") {
            importErrorDetails = result.error.problems.map(formatSaveImportWarning);
          }
          return;
        }
        bundle = result.bundle;
        parseWarnings = result.warnings ?? [];
      }

      // Track which files were loaded
      if (bundle.player) filesUsed.push("player.json");
      if (bundle.gamedata) filesUsed.push("gamedata.json");
      if (bundle.quests) filesUsed.push("quests.json");

      importStatus = m.import_status_importing();
      const { completed, warnings } = extractSaveProgress(bundle);
      const merged = userState.mergeFromSave(completed);

      importResult = {
        conflicts: merged.conflicts,
        counts: merged.counts,
        warnings: [...parseWarnings, ...warnings],
      };
    } catch {
      importError = m.import_error_unexpected();
    } finally {
      importing = false;
      importStatus = "";
      // Reset input so the same file can be re-selected
      if (fileInput) {
        fileInput.value = "";
      }
    }
  }

  function handleInputChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (files?.length) {
      void importFiles([...files]);
    }
  }

  function isSavFile(file: File): boolean {
    return file.name.toLowerCase().endsWith(".sav");
  }

  let totalImported = $derived(importResult ? totalMergeCounts(importResult.counts) : 0);
</script>

<DataCard bind:open title={m.import_card_title()} summary={m.import_card_summary()}>
  <div>
    <div class="sr-only" role="status" aria-live="polite">
      {#if importing}
        {importStatus || m.import_status_importing()}
      {:else if importResult}
        {#if totalImported > 0}{m.import_status_completed()}{:else}{m.data_no_new_data_import()}.{/if}
        {#if importResult.warnings.length > 0}
          {m.import_status_warnings_found({ count: importResult.warnings.length })}
        {/if}
      {/if}
    </div>

    <!-- Hidden file input -->
    <input
      bind:this={fileInput}
      type="file"
      aria-label={m.import_file_input_aria()}
      accept=".sav,.json"
      multiple
      class="hidden"
      onchange={handleInputChange}
    />

    <!-- Drop zone -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors {dragging
        ? 'border-primary bg-primary/5'
        : 'border-border'}"
      ondragenter={handleDragEnter}
      ondragleave={handleDragLeave}
      ondragover={handleDragOver}
      ondrop={handleDrop}
      aria-busy={importing}
    >
      {#if importing}
        <p class="text-sm text-muted-foreground">{importStatus || m.import_status_importing()}</p>
      {:else}
        <IconUpload class="size-6 text-muted-foreground" />
        <p class="text-sm text-muted-foreground">{m.import_drag_here()}</p>
        <p class="text-xs text-muted-foreground">{m.import_or()}</p>
        <button
          class="text-sm font-medium text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80"
          onclick={() => fileInput?.click()}
        >
          {m.import_browse_files()}
        </button>
      {/if}
    </div>

    <p class="mt-1.5 text-center text-xs text-muted-foreground">
      <Dialog.Root>
        <Dialog.Trigger class="underline decoration-dotted"
          >{m.import_where_is_save()}</Dialog.Trigger
        >
        <Dialog.Content class="max-w-sm" showCloseButton={false}>
          <Dialog.Header>
            <Dialog.Title>{m.import_finding_save_title()}</Dialog.Title>
            <Dialog.Description>
              {m.import_finding_save_description()}
            </Dialog.Description>
          </Dialog.Header>
          <ol class="mt-2 list-decimal space-y-2 pl-5 text-sm marker:text-muted-foreground">
            <li>
              {m.import_step_press_prefix()}
              <kbd class="rounded border px-1 font-mono text-xs">Win</kbd>
              + <kbd class="rounded border px-1 font-mono text-xs">R</kbd>
              {m.import_step_press_suffix()}
            </li>
            <li>
              {m.import_step_paste_path()}
              <div class="mt-1 flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
                <code class="flex-1 text-xs break-all">{SAV_PATH}</code>
                <button
                  onclick={copyPath}
                  class="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={m.import_copy_path_aria()}
                >
                  {#if copied}
                    <IconCheck class="size-4 text-(--color-status-success)" />
                  {:else}
                    <IconCopy class="size-4" />
                  {/if}
                </button>
              </div>
            </li>
            <li>
              {m.import_step_drag_autosave_before()} <code>-autosave.sav</code>
              {m.import_step_drag_autosave_after()}
            </li>
          </ol>
          <Dialog.Footer class="mt-2">
            <Dialog.Close>
              {#snippet child({ props })}
                <Button variant="outline" {...props}>{m.source_explainer_dismiss()}</Button>
              {/snippet}
            </Dialog.Close>
          </Dialog.Footer>
          <DialogCloseButton />
        </Dialog.Content>
      </Dialog.Root>
    </p>

    {#if importError}
      <StatusNote class="mt-3 text-base" tone="error">
        <p>{importError}</p>
        {#if importErrorDetails.length > 0}
          <ul class="mt-2 list-disc ps-5 text-sm">
            {#each importErrorDetails as detail, index (index)}
              <li>{detail}</li>
            {/each}
          </ul>
        {/if}
        {#if showSavFallbackHelp}
          <p class="mt-2 text-sm">
            {m.import_fallback_before_vaultc()}
            <!-- eslint-disable local/no-hardcoded-ui-text -- proper noun, same in every locale -->
            <a
              href="https://github.com/Villager-Studio/vaultc"
              target="_blank"
              rel="noopener noreferrer"
              class="underline">vaultc</a
            >
            <!-- eslint-enable local/no-hardcoded-ui-text -->
            {m.import_fallback_between()}
            <!-- eslint-disable local/no-hardcoded-ui-text -- proper noun, same in every locale -->
            <a
              href="https://github.com/Villager-Studio/vaultgo"
              target="_blank"
              rel="noopener noreferrer"
              class="underline">VaultGo</a
            >
            <!-- eslint-enable local/no-hardcoded-ui-text -->
            {m.import_fallback_after_vaultgo()}
          </p>
          <!-- eslint-disable local/no-hardcoded-ui-text -- "and" connects filenames, not worth its own message key -->
          <p class="mt-2 text-sm">
            {m.import_fallback_files_intro()} <code>player.json</code>, <code>gamedata.json</code>,
            and <code>quests.json</code>
            {m.import_fallback_files_suffix()}
          </p>
          <!-- eslint-enable local/no-hardcoded-ui-text -->
        {/if}
      </StatusNote>
    {/if}

    {#if importResult}
      <StatusNote class="mt-3" tone="success">
        <MergeSummary
          conflicts={importResult.conflicts}
          counts={importResult.counts}
          {filesUsed}
          kind="import"
        />

        {#if importResult.warnings.length > 0}
          <Separator class="my-2" />
          <details class="text-sm">
            <summary class="text-muted-foreground">
              {m.import_warnings_summary({ count: importResult.warnings.length })}
            </summary>
            <ul class="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-muted-foreground">
              {#each importResult.warnings as warning, index (index)}
                <li>{formatSaveImportWarning(warning)}</li>
              {/each}
            </ul>
          </details>
        {/if}
      </StatusNote>

      {#if isDesktop && onScrollToTransfer}
        <button
          class="mt-3 flex w-full items-start gap-3 rounded-md border border-(--color-status-info)/30 bg-(--color-status-info)/8 p-3 text-left transition-colors hover:bg-(--color-status-info)/15"
          onclick={onScrollToTransfer}
        >
          <IconDeviceDesktop class="mt-0.5 size-5 shrink-0 text-(--color-status-info)" />
          <div>
            <p class="text-base font-medium text-foreground">
              {m.import_playing_on_phone()}
            </p>
            <p class="mt-0.5 text-sm text-muted-foreground">
              {m.import_transfer_to_mobile()}
            </p>
          </div>
        </button>
      {/if}
    {/if}
  </div>
</DataCard>
