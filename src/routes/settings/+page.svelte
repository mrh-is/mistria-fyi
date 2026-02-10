<script lang="ts">
  import { ArrowLeft, FileUp, RotateCcw, Trash2, Upload } from "@lucide/svelte";

  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { buildImportState, parsePlayerSave } from "$lib/engine/import-save.js";
  import { theme, type Theme } from "$lib/stores/theme.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { ImportResult } from "$lib/engine/import-save.js";

  // ── Import state ──
  let importResult = $state<ImportResult | null>(null);
  let importError = $state<null | string>(null);
  let importing = $state(false);
  let showResetConfirm = $state(false);

  // ── File input ref ──
  let fileInput = $state<HTMLInputElement | null>(null);

  function handleFileSelect() {
    fileInput?.click();
  }

  async function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    importing = true;
    importResult = null;
    importError = null;

    try {
      const text = await file.text();
      const { error, save } = parsePlayerSave(text);

      if (error || !save) {
        importError = error ?? "Failed to parse save file.";
        return;
      }

      const { completed, result } = buildImportState(save);
      const merged = userState.mergeFromSave(completed);

      // Use the merged counts (only newly added items) for the result
      importResult = {
        counts: merged,
        warnings: result.warnings,
      };
    } catch {
      importError = "An unexpected error occurred while importing.";
    } finally {
      importing = false;
      // Reset file input so re-selecting same file triggers change
      input.value = "";
    }
  }

  function handleReset() {
    userState.resetAll();
    showResetConfirm = false;
    importResult = null;
  }

  // ── Export/Import state backup ──
  function handleExport() {
    const json = userState.exportState();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harvest-helper-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const ok = userState.importState(text);
      if (ok) {
        importResult = null;
        importError = null;
      } else {
        importError = "Invalid backup file format.";
      }
    };
    input.click();
  }

  let totalImported = $derived(
    importResult
      ? importResult.counts.almanac +
          importResult.counts.cosmetics +
          importResult.counts.animals +
          importResult.counts.animalCosmetics +
          importResult.counts.spells
      : 0,
  );
</script>

<div class="flex flex-col gap-4 p-4">
  <!-- Header -->
  <div class="flex items-center gap-2">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- known route -->
    <a class="text-muted-foreground hover:text-foreground" href="/">
      <ArrowLeft class="size-5" />
    </a>
    <h1 class="text-lg font-semibold">Settings</h1>
  </div>

  <!-- Theme -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Theme</Card.Title>
    </Card.Header>
    <Card.Content>
      <ToggleGroup.Root
        class="border-input w-full rounded-md border"
        type="single"
        value={theme.preference}
        onValueChange={(v) => {
          if (v) theme.set(v as Theme);
        }}
      >
        <ToggleGroup.Item class="flex-1" value="system">System</ToggleGroup.Item>
        <ToggleGroup.Item class="flex-1" value="light">Light</ToggleGroup.Item>
        <ToggleGroup.Item class="flex-1" value="dark">Dark</ToggleGroup.Item>
      </ToggleGroup.Root>
    </Card.Content>
  </Card.Root>

  <!-- Import from Save File -->
  <Card.Root>
    <Card.Header>
      <Card.Title class="flex items-center gap-2">
        <Upload class="size-4" />
        Import from Save File
      </Card.Title>
      <Card.Description>
        Import your Fields of Mistria <code>player.json</code> to auto-populate progress. This merges
        with your existing data — nothing is removed.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <input
        bind:this={fileInput}
        accept=".json"
        class="hidden"
        type="file"
        onchange={handleFileChange}
      />
      <Button class="w-full" disabled={importing} variant="outline" onclick={handleFileSelect}>
        <FileUp />
        {importing ? "Importing..." : "Select player.json"}
      </Button>

      {#if importError}
        <div
          class="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {importError}
        </div>
      {/if}

      {#if importResult}
        <div class="mt-3 rounded-md bg-green-50 p-3 dark:bg-green-950">
          <p class="text-sm font-medium text-green-800 dark:text-green-200">
            Imported {totalImported} new items
          </p>
          {#if totalImported > 0}
            <ul class="text-muted-foreground mt-1 space-y-0.5 text-xs">
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
            </ul>
          {/if}

          {#if importResult.warnings.length > 0}
            <Separator class="my-2" />
            <details class="text-xs">
              <summary class="text-muted-foreground cursor-pointer">
                {importResult.warnings.length} warnings
              </summary>
              <ul class="text-muted-foreground mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                {#each importResult.warnings as warning (warning)}
                  <li>{warning}</li>
                {/each}
              </ul>
            </details>
          {/if}
        </div>

        <div class="mt-3 rounded-md bg-sky-50 p-3 dark:bg-sky-950">
          <p class="text-sm font-medium text-sky-800 dark:text-sky-200">Some data is manual-only</p>
          <p class="text-muted-foreground mt-1 text-xs">We can't yet import data for:</p>
          <ul class="text-muted-foreground mt-1 list-inside list-disc space-y-0.5 text-xs">
            <li>Museum donations</li>
            <li>NPC hearts</li>
            <li>Quest completion</li>
            <li>Skill levels</li>
            <li>Town renown</li>
            <li>Exact mine floor</li>
          </ul>
          <p class="text-muted-foreground mt-3 text-xs">
            You'll have to track this manually for now.
          </p>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Backup & Restore -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Backup & Restore</Card.Title>
      <Card.Description>Export or import your full tracker progress.</Card.Description>
    </Card.Header>
    <Card.Content class="flex flex-col gap-2">
      <Button variant="outline" onclick={handleExport}>
        <FileUp />
        Export backup
      </Button>
      <Button variant="outline" onclick={handleImportBackup}>
        <Upload />
        Restore from backup
      </Button>
    </Card.Content>
  </Card.Root>

  <!-- Danger Zone -->
  <Card.Root class="border-red-200 dark:border-red-900">
    <Card.Header>
      <Card.Title class="text-red-600 dark:text-red-400">Danger Zone</Card.Title>
    </Card.Header>
    <Card.Content>
      {#if showResetConfirm}
        <p class="mb-3 text-sm">Are you sure? This will erase all your tracked progress.</p>
        <div class="flex w-full justify-stretch gap-2">
          <Button class="grow-0" variant="destructive" onclick={handleReset}>
            <Trash2 />
            Yes, reset everything
          </Button>
          <Button class="grow" variant="outline" onclick={() => (showResetConfirm = false)}>
            Never mind
          </Button>
        </div>
      {:else}
        <Button
          class="w-full"
          variant="outline"
          onclick={() => {
            showResetConfirm = true;
          }}
        >
          <RotateCcw />
          Reset all progress
        </Button>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
