<script lang="ts">
  import { FileUp, Monitor, Upload } from "@lucide/svelte";

  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { buildImportState, parsePlayerSave } from "$lib/engine/import-save.js";
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
  let importing = $state(false);

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

<Card.Root>
  <Card.Header>
    <Card.Title class="flex items-center gap-2">
      <Upload class="size-4" />
      Import from Save File
    </Card.Title>
    <Card.Description>
      Import your Fields of Mistria <code>player.json</code> to auto-populate progress. This merges with
      your existing data — nothing is removed.
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

      {#if isDesktop && onScrollToTransfer}
        <button
          class="mt-3 flex w-full items-start gap-3 rounded-md border border-violet-200 bg-violet-50 p-3 text-left transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950 dark:hover:bg-violet-900"
          onclick={onScrollToTransfer}
        >
          <Monitor class="mt-0.5 size-5 shrink-0 text-violet-600 dark:text-violet-400" />
          <div>
            <p class="text-sm font-medium text-violet-800 dark:text-violet-200">
              Playing on your phone?
            </p>
            <p class="text-muted-foreground mt-0.5 text-xs">
              Transfer this progress to your mobile device →
            </p>
          </div>
        </button>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
