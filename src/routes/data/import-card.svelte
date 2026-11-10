<script lang="ts">
  import IconCheck from "@tabler/icons-svelte-runes/icons/check";
  import IconCopy from "@tabler/icons-svelte-runes/icons/copy";
  import IconDeviceDesktop from "@tabler/icons-svelte-runes/icons/device-desktop";
  import IconUpload from "@tabler/icons-svelte-runes/icons/upload";
  import { onMount } from "svelte";

  import DialogCloseButton from "#lib/components/dialog-close-button.svelte";
  import StatusNote from "#lib/components/status-note.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Separator } from "#lib/components/ui/separator/index.js";
  import { trackingReminders } from "#lib/controllers/tracking-reminders.svelte.js";
  import { extractSaveProgress, SavArchiveError, unpackSavFile } from "#lib/engine/import-save.js";
  import { readSaveIdentity } from "#lib/engine/save-identity.js";
  import { getFeedbackContext } from "#lib/feedback/context.svelte.js";
  import { describeErrorForReport } from "#lib/feedback/error-details.js";
  import { totalMergeCounts } from "#lib/presentation/merge-labels.js";
  import { progressImport } from "#lib/progress/index.js";
  import { holdUpdatesWhile } from "#lib/pwa/update-holds.js";
  import { isIosDevice } from "#lib/utils/ios-device.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { messageParts } from "#lib/utils/message-parts.js";
  import { page } from "$app/state";

  import DataCard from "./data-card.svelte";
  import { formatSavArchiveError, formatSaveImportWarning } from "./data-error-messages.js";
  import LastImport from "./last-import.svelte";
  import MergeSummary from "./merge-summary.svelte";

  import type { SaveImportReport, SaveImportWarning } from "#lib/engine/import-save.js";
  import type { SyncedSave } from "#lib/progress/index.js";

  let {
    onScrollToTransfer,
    open = $bindable(false),
  }: { onScrollToTransfer?: () => void; open?: boolean } = $props();

  // ── Desktop detection (simple heuristic) ──
  let isDesktop = $derived(
    typeof globalThis.matchMedia === "function" &&
      globalThis.matchMedia("(min-width: 768px)").matches,
  );

  // iOS has no registered type for .sav, so any `accept` filter greys those files out in the Files
  // sheet. Drop the filter there; the importer validates the contents either way.
  // Narrowing it again isn't possible: iOS maps `accept` to UTIs, and an unregistered extension
  // only conforms to public.data, which every file does. So iOS gets a hint instead.
  let onIos = $state(false);
  let acceptSaveTypes = $derived(onIos ? undefined : ".sav");
  onMount(() => {
    onIos = isIosDevice();
  });

  // ── Import state ──
  let importResult = $state<null | SaveImportReport>(null);
  let importError = $state<null | string>(null);
  /** The error is the unreadable-save one, whose "send us feedback" opens the feedback form. */
  let importErrorOffersFeedback = $state(false);
  /** Redacted exception details for the feedback draft, when the failure threw one. */
  let importErrorReportDetails = $state<string | undefined>();
  const feedbackContext = getFeedbackContext();
  let importing = $state(false);
  let importStatus = $state("");
  let filesUsed = $state<string[]>([]);
  // The dialog stays mounted while it closes, after the pending import has been cleared.
  let unnumberedFarmPrompt = $state(false);
  let farmPrompt = $state.raw<null | {
    farm: string;
    save: SyncedSave;
    warnings: SaveImportWarning[];
  }>(null);

  // ── Drag-and-drop state ──
  let dragCounter = $state(0);
  let dragging = $derived(dragCounter > 0);

  // ── Hidden file input ref ──
  let fileInput = $state<HTMLInputElement | null>(null);

  // An app update's reload waits while an import applies and while its summary is on screen.
  $effect(() => holdUpdatesWhile(importing || farmPrompt !== null || importResult !== null));

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

  /** The feedback draft: the error the player saw, then any redacted details for debugging. */
  function importErrorReport(error: string): string {
    return importErrorReportDetails === undefined
      ? error
      : `${error}\n\n${`Technical details: ${importErrorReportDetails}`}`;
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
    if (!files || files.length === 0 || importing || farmPrompt) return;

    importing = true;
    importResult = null;
    importError = null;
    importErrorOffersFeedback = false;
    importErrorReportDetails = undefined;
    importStatus = "";
    filesUsed = [];

    try {
      const savFile = files[0];
      if (!savFile || files.some((file) => !isSavFile(file))) {
        importError = "Choose a .sav file.";
        return;
      }

      let bundle;
      importStatus = "Unpacking save file…";
      try {
        bundle = await unpackSavFile(savFile);
      } catch (error) {
        // A failure the archive reader doesn't recognize is worth a report, so it links to feedback.
        const known = error instanceof SavArchiveError;
        importError = known
          ? formatSavArchiveError(error.detail)
          : `We couldn’t read that save file. ${"Try the newest file that ends in “autosave”."} If that one doesn’t work either, ${"send us feedback"} and we’ll look into it.`;
        importErrorOffersFeedback = !known;
        if (!known) importErrorReportDetails = describeErrorForReport(error);
        return;
      }

      filesUsed = [savFile.name];

      importStatus = "Importing…";
      const { completed, day, playtime, warnings } = extractSaveProgress(bundle);
      await applyImport(
        {
          completed,
          day,
          metadata: { ...readSaveIdentity(bundle), importedAt: Date.now() },
          playtime,
        },
        warnings,
      );
    } catch {
      importError =
        "Well, that import didn’t go as planned. Your progress here is safe, so give it another try.";
    } finally {
      importing = false;
      importStatus = "";
      // Reset input so the same file can be re-selected
      if (fileInput) {
        fileInput.value = "";
      }
    }
  }

  async function applyImport(
    save: SyncedSave,
    warnings: SaveImportWarning[],
    confirmedFarm?: string,
  ) {
    const { completed, day, metadata, playtime } = save;
    const outcome = await progressImport.mergeFromSave(completed, {
      confirmedFarm,
      day,
      metadata,
      playtime,
    });
    switch (outcome.kind) {
      case "ask":
        unnumberedFarmPrompt = outcome.reason === "unnumbered";
        farmPrompt = { farm: outcome.farm, save, warnings };
        break;
      case "applied":
        // The import sets the day, so the clock no longer needs a nudge.
        trackingReminders.clearClockHint();
        importResult = { ...outcome.result, warnings };
        break;
      case "busy":
        importError =
          "We’re still working on your last import! Give it one second, then try that file again.";
        break;
      case "newer-data":
        importError =
          "Your progress is safe! A newer version of the field guide saved it, so reload this page to get the latest update.";
        break;
      case "sync-active":
        importError =
          "This device already syncs your save file, so there’s nothing to import! To import by hand instead, stop syncing first.";
        break;
      case "write-failed":
        importError =
          "We couldn’t store this import. Check your settings to make sure your browser’s storage isn’t full or turned off, then try again.";
        break;
    }
  }

  async function confirmFarm() {
    if (!farmPrompt || importing) return;
    const { farm, save, warnings } = farmPrompt;
    importing = true;
    farmPrompt = null;
    try {
      await applyImport(save, warnings, farm);
    } catch {
      importError =
        "Well, that import didn’t go as planned. Your progress here is safe, so give it another try.";
    } finally {
      importing = false;
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

<DataCard
  bind:open
  title="Import from save file"
  summary="Import progress from a Fields of Mistria save."
>
  <div>
    {#if progressImport.lastImport}
      <LastImport metadata={progressImport.lastImport} locale={page.data.locale} />
    {/if}
    <div class="sr-only" role="status" aria-live="polite">
      {#if importing}
        {importStatus || "Importing…"}
      {:else if importResult}
        {#if totalImported > 0}Import completed.{:else}No new data to import.{/if}
        {#if importResult.warnings.length > 0}
          {`${importResult.warnings.length} warnings found.`}
        {/if}
      {/if}
    </div>

    <!-- Hidden file input -->
    <input
      bind:this={fileInput}
      type="file"
      aria-label="Choose save files to import"
      accept={acceptSaveTypes}
      disabled={importing || farmPrompt !== null}
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
        <p class="text-sm text-muted-foreground">{importStatus || "Importing…"}</p>
      {:else}
        <IconUpload class="size-6 text-muted-foreground" />
        <p class="text-sm text-muted-foreground">Drag your save file here</p>
        <p class="text-xs text-muted-foreground">or</p>
        <button
          class="text-sm font-medium text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80"
          onclick={() => fileInput?.click()}
        >
          browse files
        </button>
      {/if}
    </div>

    {#if onIos}
      <p class="mt-1.5 text-center text-xs text-muted-foreground" data-testid="ios-picker-hint">
        Choose the .sav file you copied over from your gaming computer. Your iPhone shows every file
        here, so look for one ending in .sav.
      </p>
    {/if}

    <p class="mt-1.5 text-center text-xs text-muted-foreground">
      <Dialog.Root>
        <Dialog.Trigger class="underline decoration-dotted">Where is my save file?</Dialog.Trigger>
        <Dialog.Content class="max-w-sm" showCloseButton={false}>
          <Dialog.Header>
            <Dialog.Title>Finding your save file</Dialog.Title>
            <Dialog.Description>
              Fields of Mistria saves are stored in your Windows user folder.
            </Dialog.Description>
          </Dialog.Header>
          <ol class="mt-2 list-decimal space-y-2 pl-5 text-sm marker:text-muted-foreground">
            <li>
              Press
              <kbd class="rounded border px-1 font-mono text-xs"><!-- @wc-ignore -->Win</kbd>
              + <kbd class="rounded border px-1 font-mono text-xs"><!-- @wc-ignore -->R</kbd>
              to open the Run dialog
            </li>
            <li>
              Paste this path and press Enter:
              <div class="mt-1 flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
                <code class="flex-1 text-xs break-all">{SAV_PATH}</code>
                <button
                  onclick={copyPath}
                  class="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Copy path"
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
              Drag the file ending in <code>-autosave.sav</code>
              onto the drop zone above.
            </li>
          </ol>
          <Dialog.Footer class="mt-2">
            <Dialog.Close>
              {#snippet child({ props })}
                <Button variant="outline" {...props}>Got it</Button>
              {/snippet}
            </Dialog.Close>
          </Dialog.Footer>
          <DialogCloseButton />
        </Dialog.Content>
      </Dialog.Root>
    </p>

    {#if importError}
      <StatusNote class="mt-3 text-base" tone="error">
        {#if importErrorOffersFeedback}
          <p>
            {#each messageParts((slot) => `We couldn’t read that save file. ${"Try the newest file that ends in “autosave”."} If that one doesn’t work either, ${slot("feedback")} and we’ll look into it.`) as part, index (index)}
              {#if typeof part === "string"}{part}{:else}<button
                  type="button"
                  class="cursor-pointer underline underline-offset-2"
                  onclick={() => {
                    if (importError) feedbackContext.reportError(importErrorReport(importError));
                  }}>send us feedback</button
                >{/if}
            {/each}
          </p>
        {:else}
          <p>{importError}</p>
        {/if}
      </StatusNote>
    {/if}

    <Dialog.Root
      open={farmPrompt !== null}
      onOpenChange={(open) => {
        if (!open) farmPrompt = null;
      }}
    >
      <Dialog.Content class="sm:max-w-sm" showCloseButton={false}>
        <Dialog.Header>
          <Dialog.Title>
            {unnumberedFarmPrompt
              ? "Is this the farm you’ve been tracking?"
              : "This save is for a different farm"}
          </Dialog.Title>
          <Dialog.Description>
            {unnumberedFarmPrompt
              ? "We can’t tell which farm this save belongs to. If you merge it, we’ll add its progress to what you’ve already tracked."
              : "If you merge it, we’ll mix its progress in with what you’ve already tracked here. Nothing you’ve tracked gets removed."}
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Footer>
          <Dialog.Close>
            {#snippet child({ props })}
              <Button variant="outline" {...props}>Cancel</Button>
            {/snippet}
          </Dialog.Close>
          <Button onclick={() => void confirmFarm()}>Merge progress</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>

    {#if importResult}
      <StatusNote class="mt-3" tone="success">
        <MergeSummary conflicts={importResult.conflicts} counts={importResult.counts} {filesUsed} />

        {#if importResult.warnings.length > 0}
          <Separator class="my-2" />
          <details class="text-sm">
            <summary class="text-muted-foreground">
              {`${importResult.warnings.length} warnings`}
            </summary>
            <ul class="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-muted-foreground">
              {#each importResult.warnings as warning, index (index)}
                <li>{formatSaveImportWarning(warning)}</li>
              {/each}
            </ul>
          </details>
        {/if}
      </StatusNote>

      <Button class="mt-3" href={localizedHref("everything")}>See what’s left</Button>

      {#if isDesktop && onScrollToTransfer}
        <button
          class="mt-3 flex w-full items-start gap-3 rounded-md border border-(--color-status-info)/30 bg-(--color-status-info)/8 p-3 text-left transition-colors hover:bg-(--color-status-info)/15"
          onclick={onScrollToTransfer}
        >
          <IconDeviceDesktop class="mt-0.5 size-5 shrink-0 text-(--color-status-info)" />
          <div>
            <p class="text-base font-medium text-foreground">Playing on your phone?</p>
            <p class="mt-0.5 text-sm text-muted-foreground">
              Use sync or a backup on your other device →
            </p>
          </div>
        </button>
      {/if}
    {/if}
  </div>
</DataCard>
