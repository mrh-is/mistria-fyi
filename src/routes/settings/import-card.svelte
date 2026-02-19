<script lang="ts">
  import { FileUp, Monitor, Upload } from "@lucide/svelte";

  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { buildImportState, parseSaveFiles } from "$lib/engine/import-save.js";
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
  let filesUsed = $state<string[]>([]);

  // ── File input ref ──
  let fileInput = $state<HTMLInputElement | null>(null);

  function handleFileSelect() {
    fileInput?.click();
  }

  async function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    importing = true;
    importResult = null;
    importError = null;
    filesUsed = [];

    try {
      const { bundle, error } = await parseSaveFiles(files);

      if (error || !bundle) {
        importError = error ?? "Failed to parse save files.";
        return;
      }

      // Track which files were loaded
      if (bundle.player) filesUsed.push("player.json");
      if (bundle.gamedata) filesUsed.push("gamedata.json");
      if (bundle.quests) filesUsed.push("quests.json");

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
      <Upload class="size-4" />
      Import from Save File
    </Card.Title>
    <Card.Description>
      Import your extracted Fields of Mistria save files to auto-populate progress. Use <a
        href="https://github.com/NPC-Studio/vaultc"
        target="_blank"
        rel="noopener noreferrer"
        class="underline">vaultc</a
      >
      to extract your <code>.sav</code> file, then select the resulting JSON files below.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    <input
      bind:this={fileInput}
      accept=".json"
      class="hidden"
      type="file"
      multiple
      onchange={handleFileChange}
    />
    <Button class="w-full" disabled={importing} variant="outline" onclick={handleFileSelect}>
      <FileUp />
      {importing ? "Importing..." : "Select save files"}
    </Button>
    <p class="mt-1.5 text-center text-xs text-muted-foreground">
      Select one or more: player.json, gamedata.json, quests.json
    </p>

    {#if importError}
      <div
        class="mt-3 rounded-md bg-red-50 p-3 text-base text-red-700 dark:bg-red-950 dark:text-red-300"
      >
        {importError}
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
