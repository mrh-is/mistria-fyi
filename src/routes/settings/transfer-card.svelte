<script lang="ts">
  import { Camera, ImagePlus, LoaderCircle, QrCode, Smartphone, X } from "@lucide/svelte";
  import QrScanner from "qr-scanner";
  import QRCode from "qrcode";

  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { decodeTransferPayload, encodeTransferPayload } from "$lib/engine/transfer.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import type { MergeCounts } from "$lib/stores/user-state.svelte.js";

  // ── State ──
  let generating = $state(false);
  let qrDataUrl = $state<null | string>(null);

  let scanning = $state(false);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let scanner: null | QrScanner = null;

  let transferResult = $state<MergeCounts | null>(null);
  let transferError = $state<null | string>(null);

  // ── Generate QR Code ──
  async function handleGenerate() {
    generating = true;
    qrDataUrl = null;
    transferResult = null;
    transferError = null;

    try {
      const payload = await encodeTransferPayload(userState.state.completed);
      const dataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: "L",
        margin: 2,
        width: 300,
      });
      qrDataUrl = dataUrl;
    } catch (err) {
      transferError = `Failed to generate QR code: ${err instanceof Error ? err.message : "unknown error"}`;
    } finally {
      generating = false;
    }
  }

  // ── Scan QR Code (camera) ──
  async function handleScan() {
    transferResult = null;
    transferError = null;
    qrDataUrl = null;
    scanning = true;

    // Wait for video element to bind
    await new Promise((r) => setTimeout(r, 50));

    if (!videoEl) {
      transferError = "Could not initialize camera.";
      scanning = false;
      return;
    }

    try {
      scanner = new QrScanner(
        videoEl,
        (result) => {
          void handleScanResult(result.data);
        },
        {
          highlightCodeOutline: true,
          highlightScanRegion: true,
          returnDetailedScanResult: true,
        },
      );
      await scanner.start();
    } catch (err) {
      scanning = false;
      if (err instanceof Error && err.message.includes("permission")) {
        transferError = "Camera access denied. Try scanning from an image instead.";
      } else {
        transferError = `Camera error: ${err instanceof Error ? err.message : "Could not access camera"}`;
      }
    }
  }

  function stopScanning() {
    if (scanner) {
      scanner.stop();
      scanner.destroy();
      scanner = null;
    }
    scanning = false;
  }

  // ── Scan from image file ──
  function handleImageUpload() {
    transferResult = null;
    transferError = null;
    qrDataUrl = null;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
        await handleScanResult(result.data);
      } catch {
        transferError = "No QR code found in image. Make sure the image is clear and well-lit.";
      }
    };
    input.click();
  }

  // ── Common decode + merge ──
  async function handleScanResult(data: string) {
    stopScanning();
    try {
      const decoded = await decodeTransferPayload(data);
      const counts = userState.mergeFromSave(decoded);
      transferResult = counts;
    } catch (err) {
      transferError = `Invalid QR code: ${err instanceof Error ? err.message : "could not decode"}`;
    }
  }

  let totalMerged = $derived(
    transferResult
      ? transferResult.almanac +
          transferResult.cosmetics +
          transferResult.animals +
          transferResult.animalCosmetics +
          transferResult.museum +
          transferResult.spells +
          transferResult.npcLevels +
          transferResult.skillLevels +
          transferResult.quests +
          transferResult.mineFloor +
          transferResult.renown
      : 0,
  );
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="flex items-center gap-2">
      <Smartphone class="size-4" />
      Transfer to Another Device
    </Card.Title>
    <Card.Description>
      Transfer your progress between devices using a QR code. Generate on one device, scan on
      another.
    </Card.Description>
  </Card.Header>
  <Card.Content class="flex flex-col gap-3">
    <!-- Generate QR Code -->
    <Button class="w-full" disabled={generating} variant="outline" onclick={handleGenerate}>
      {#if generating}
        <LoaderCircle class="animate-spin" />
        Generating...
      {:else}
        <QrCode />
        Generate QR Code
      {/if}
    </Button>

    <!-- QR Code display -->
    {#if qrDataUrl}
      <div class="flex flex-col items-center gap-2 rounded-md border p-4">
        <img alt="Transfer QR Code" class="size-48" src={qrDataUrl} />
        <p class="text-center text-sm text-muted-foreground">
          Scan this code on your other device to transfer progress
        </p>
      </div>
    {/if}

    <!-- Scan QR Code -->
    {#if !scanning}
      <Button class="w-full" variant="outline" onclick={handleScan}>
        <Camera />
        Scan QR Code
      </Button>
    {/if}

    <!-- Camera scanner -->
    {#if scanning}
      <div class="relative overflow-hidden rounded-md border">
        <video bind:this={videoEl} class="aspect-square w-full object-cover"></video>
        <Button
          class="absolute top-2 right-2"
          size="icon"
          variant="ghost"
          onclick={stopScanning}
          aria-label="Close camera"
        >
          <X />
        </Button>
      </div>
    {/if}

    <!-- Image fallback -->
    <Button class="w-full text-sm" variant="ghost" onclick={handleImageUpload}>
      <ImagePlus class="size-3" />
      Or scan from a screenshot...
    </Button>

    <!-- Success -->
    {#if transferResult}
      <div class="rounded-md bg-green-50 p-3 dark:bg-green-950">
        {#if totalMerged > 0}
          <p class="text-base font-medium text-green-800 dark:text-green-200">
            Transferred {totalMerged} items!
          </p>
          <ul class="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {#if transferResult.almanac > 0}
              <li>Almanac: +{transferResult.almanac}</li>
            {/if}
            {#if transferResult.cosmetics > 0}
              <li>Cosmetics: +{transferResult.cosmetics}</li>
            {/if}
            {#if transferResult.animals > 0}
              <li>Animal variants: +{transferResult.animals}</li>
            {/if}
            {#if transferResult.animalCosmetics > 0}
              <li>Animal cosmetics: +{transferResult.animalCosmetics}</li>
            {/if}
            {#if transferResult.museum > 0}
              <li>Museum: +{transferResult.museum}</li>
            {/if}
            {#if transferResult.spells > 0}
              <li>Spells: +{transferResult.spells}</li>
            {/if}
            {#if transferResult.mineFloor > 0}
              <li>Mine floor: +{transferResult.mineFloor} floors</li>
            {/if}
            {#if transferResult.npcLevels > 0}
              <li>NPC hearts: +{transferResult.npcLevels} NPCs updated</li>
            {/if}
            {#if transferResult.skillLevels > 0}
              <li>Skills: +{transferResult.skillLevels} skills updated</li>
            {/if}
            {#if transferResult.quests > 0}
              <li>Quests: +{transferResult.quests} quests updated</li>
            {/if}
            {#if transferResult.renown > 0}
              <li>Renown: +{transferResult.renown} levels</li>
            {/if}
          </ul>
        {:else}
          <p class="text-base font-medium text-green-800 dark:text-green-200">
            QR code scanned successfully — no new items to add.
          </p>
        {/if}
      </div>
    {/if}

    <!-- Error -->
    {#if transferError}
      <div
        class="rounded-md bg-red-50 p-3 text-base text-red-700 dark:bg-red-950 dark:text-red-300"
      >
        {transferError}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
