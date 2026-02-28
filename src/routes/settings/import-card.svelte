<script lang="ts">
  import { Check, Copy, FolderOpen, Monitor } from "@lucide/svelte";

  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { buildImportState, parseSaveFiles, unpackSavFile } from "$lib/engine/import-save.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { ImportResult } from "$lib/engine/import-save.js";

  let { onScrollToTransfer }: { onScrollToTransfer?: () => void } = $props();

  // ── Desktop detection (simple heuristic) ──
  let isDesktop = $derived(
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );

  // ── Import state ──
  let importResult = $state<ImportResult | null>(null);
  let importError = $state<null | string>(null);
  let savFallback = $state(false);
  let importing = $state(false);
  let importStatus = $state("");
  let filesUsed = $state<string[]>([]);

  // ── File input ref ──
  let fileInput = $state<HTMLInputElement | null>(null);

  // ── Save location dialog ──
  const SAV_PATH = String.raw`%LOCALAPPDATA%\FieldsOfMistria\saves`;
  let copied = $state(false);

  function copyPath() {
    void navigator.clipboard.writeText(SAV_PATH).then(() => {
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    });
  }

  function handleFileSelect() {
    fileInput?.click();
  }

  function isSavFile(file: File): boolean {
    return file.name.toLowerCase().endsWith(".sav");
  }

  async function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    importing = true;
    importResult = null;
    importError = null;
    savFallback = false;
    importStatus = "";
    filesUsed = [];

    try {
      // Check if user selected a .sav file
      const savFile = Array.from(files).find(isSavFile);

      let bundle;
      if (savFile) {
        importStatus = "Unpacking save file\u2026";
        try {
          bundle = await unpackSavFile(savFile);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          importError = message;
          savFallback = true;
          return;
        }
      } else {
        const result = await parseSaveFiles(files);
        if (result.error || !result.bundle) {
          importError = result.error ?? "Failed to parse save files.";
          return;
        }
        bundle = result.bundle;
      }

      // Track which files were loaded
      if (bundle.player) filesUsed.push("player.json");
      if (bundle.gamedata) filesUsed.push("gamedata.json");
      if (bundle.quests) filesUsed.push("quests.json");

      importStatus = "Importing\u2026";
      const { completed, result } = buildImportState(bundle);
      const merged = userState.mergeFromSave(completed);

      importResult = {
        counts: merged,
        warnings: result.warnings,
      };
    } catch {
      importError = "An unexpected error occurred while importing.";
    } finally {
      importing = false;
      importStatus = "";
      input.value = "";
    }
  }

  let totalImported = $derived(
    importResult
      ? importResult.counts.almanac +
          importResult.counts.cosmetics +
          importResult.counts.animals +
          importResult.counts.animalCosmetics +
          importResult.counts.spells +
          importResult.counts.museum +
          importResult.counts.npcLevels +
          importResult.counts.quests +
          importResult.counts.skillLevels +
          importResult.counts.mineFloor +
          importResult.counts.renown
      : 0,
  );
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="flex items-center gap-2">
      <FolderOpen class="size-4" />
      Import from Save File
    </Card.Title>
    <Card.Description>
      Import your Fields of Mistria save to auto-populate your progress. Processed entirely in your
      browser — your save file is never uploaded anywhere.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    <input
      bind:this={fileInput}
      accept=".sav,.json"
      class="hidden"
      type="file"
      multiple
      onchange={handleFileChange}
    />
    <Button class="w-full" disabled={importing} variant="outline" onclick={handleFileSelect}>
      <FolderOpen />
      {#if importing}
        {importStatus || "Importing\u2026"}
      {:else}
        Open save file
      {/if}
    </Button>
    <p class="mt-1.5 text-center text-xs text-muted-foreground">
      <Dialog.Root>
        <Dialog.Trigger class="underline decoration-dotted">Where is my save file?</Dialog.Trigger>
        <Dialog.Content class="max-w-sm">
          <Dialog.Header>
            <Dialog.Title>Finding your save file</Dialog.Title>
            <Dialog.Description>
              Fields of Mistria saves are stored in your Windows user folder.
            </Dialog.Description>
          </Dialog.Header>
          <ol class="mt-2 list-decimal space-y-2 pl-5 text-sm marker:text-muted-foreground">
            <li>
              Press
              <kbd class="rounded border px-1 font-mono text-xs">Win</kbd>
              + <kbd class="rounded border px-1 font-mono text-xs">R</kbd> to open the Run dialog
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
                    <Check class="size-4 text-green-600" />
                  {:else}
                    <Copy class="size-4" />
                  {/if}
                </button>
              </div>
            </li>
            <li>
              Select the file ending in <code>-autosave.sav</code>.
            </li>
          </ol>
          <Dialog.Footer class="mt-2">
            <Dialog.Close>
              <Button variant="outline">Got it</Button>
            </Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </p>

    {#if importError}
      <div
        class="mt-3 rounded-md bg-red-50 p-3 text-base text-red-700 dark:bg-red-950 dark:text-red-300"
      >
        <p>{importError}</p>
        {#if savFallback}
          <p class="mt-2 text-sm">
            As a fallback, you can extract the JSON files manually using <a
              href="https://github.com/NPC-Studio/vaultc"
              target="_blank"
              rel="noopener noreferrer"
              class="underline">vaultc</a
            >
            (on Windows) or
            <a
              href="https://github.com/NPC-Studio/vaultgo"
              target="_blank"
              rel="noopener noreferrer"
              class="underline">VaultGo</a
            > (on macOS or Linux).
          </p>
          <p class="mt-2 text-sm">
            Then import from the resulting <code>player.json</code>, <code>gamedata.json</code>, and
            <code>quests.json</code> files.
          </p>
        {/if}
      </div>
    {/if}

    {#if importResult}
      <div class="mt-3 rounded-md bg-green-50 p-3 dark:bg-green-950">
        <p class="text-base font-medium text-green-800 dark:text-green-200">
          {#if totalImported > 0}
            Imported from {filesUsed.join(", ")}
          {:else}
            No new data to import
          {/if}
        </p>
        {#if totalImported > 0}
          <ul class="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {#if importResult.counts.almanac > 0}
              <li>Almanac: +{importResult.counts.almanac}</li>
            {/if}
            {#if importResult.counts.cosmetics > 0}
              <li>Cosmetics: +{importResult.counts.cosmetics}</li>
            {/if}
            {#if importResult.counts.animals > 0}
              <li>Animal variants: +{importResult.counts.animals}</li>
            {/if}
            {#if importResult.counts.animalCosmetics > 0}
              <li>Animal cosmetics: +{importResult.counts.animalCosmetics}</li>
            {/if}
            {#if importResult.counts.spells > 0}
              <li>Spells: +{importResult.counts.spells}</li>
            {/if}
            {#if importResult.counts.museum > 0}
              <li>Museum donations: +{importResult.counts.museum}</li>
            {/if}
            {#if importResult.counts.npcLevels > 0}
              <li>NPC hearts: +{importResult.counts.npcLevels} NPCs updated</li>
            {/if}
            {#if importResult.counts.quests > 0}
              <li>Quests: +{importResult.counts.quests}</li>
            {/if}
            {#if importResult.counts.skillLevels > 0}
              <li>Skills: +{importResult.counts.skillLevels} skills updated</li>
            {/if}
            {#if importResult.counts.mineFloor > 0}
              <li>Mine floor: +{importResult.counts.mineFloor} floors</li>
            {/if}
            {#if importResult.counts.renown > 0}
              <li>Renown: +{importResult.counts.renown} levels</li>
            {/if}
          </ul>
        {/if}

        {#if importResult.warnings.length > 0}
          <Separator class="my-2" />
          <details class="text-sm">
            <summary class="cursor-pointer text-muted-foreground">
              {importResult.warnings.length} warnings
            </summary>
            <ul class="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-muted-foreground">
              {#each importResult.warnings as warning (warning)}
                <li>{warning}</li>
              {/each}
            </ul>
          </details>
        {/if}
      </div>

      {#if isDesktop && onScrollToTransfer}
        <button
          class="mt-3 flex w-full items-start gap-3 rounded-md border border-violet-200 bg-violet-50 p-3 text-left transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950 dark:hover:bg-violet-900"
          onclick={onScrollToTransfer}
        >
          <Monitor class="mt-0.5 size-5 shrink-0 text-violet-600 dark:text-violet-400" />
          <div>
            <p class="text-base font-medium text-violet-800 dark:text-violet-200">
              Playing on your phone?
            </p>
            <p class="mt-0.5 text-sm text-muted-foreground">
              Transfer this progress to your mobile device →
            </p>
          </div>
        </button>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
