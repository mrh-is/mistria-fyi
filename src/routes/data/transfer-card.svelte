<script lang="ts">
  import { IconCamera, IconLoader2, IconPhotoPlus, IconQrcode } from "@tabler/icons-svelte-runes";
  import QrScanner from "qr-scanner";
  import QRCode from "qrcode";

  import { Icon } from "$lib/components/icon/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { decodeTransferPayload, encodeTransferPayload } from "$lib/engine/transfer.js";
  import * as m from "$lib/paraglide/messages.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import DataCard from "./data-card.svelte";
  import { closeScanner } from "./data-effects";
  import MergeSummary from "./merge-summary.svelte";

  import type { MergeCounts } from "$lib/stores/user-state.svelte.js";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  // ── State ──
  let generating = $state(false);
  let qrDataUrl = $state<null | string>(null);

  let scanning = $state(false);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let scanner: null | QrScanner = null;
  let scanAttempt = 0;

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
      transferError = `${m.transfer_error_generate_prefix()} ${err instanceof Error ? err.message : m.transfer_unknown_error()}`;
    } finally {
      generating = false;
    }
  }

  // ── Scan QR Code (camera) ──
  async function handleScan() {
    const attempt = ++scanAttempt;
    transferResult = null;
    transferError = null;
    qrDataUrl = null;
    scanning = true;

    // Wait for video element to bind
    await new Promise((r) => setTimeout(r, 50));

    if (!open || attempt !== scanAttempt) return;

    if (!videoEl) {
      transferError = m.transfer_error_camera_init();
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
        transferError = m.transfer_error_camera_denied();
      } else {
        transferError = `${m.transfer_error_camera_prefix()} ${err instanceof Error ? err.message : m.transfer_error_unknown_camera()}`;
      }
    }
  }

  function stopScanning() {
    scanAttempt += 1;
    scanner = closeScanner(scanner);
    scanning = false;
  }

  $effect(() => {
    if (!open) {
      stopScanning();
    }
  });

  // ── Scan from image file ──
  function handleImageUpload() {
    transferResult = null;
    transferError = null;
    qrDataUrl = null;

    const input = document.createElement("input");
    input.type = "file";
    input.name = "transfer-image";
    input.setAttribute("aria-label", m.transfer_image_upload_aria());
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
        await handleScanResult(result.data);
      } catch {
        transferError = m.transfer_error_no_qr_in_image();
      }
    };
    input.className = "sr-only";
    input.oncancel = () => {
      input.remove();
    };
    document.body.append(input);
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
      transferError = `${m.transfer_error_invalid_qr_prefix()} ${err instanceof Error ? err.message : m.transfer_error_could_not_decode()}`;
    }
  }
</script>

<DataCard bind:open title={m.transfer_card_title()} summary={m.transfer_card_summary()}>
  <div class="flex flex-col gap-3">
    <div class="sr-only" role="status" aria-live="polite">
      {#if generating}
        {m.transfer_generating_status()}
      {:else if scanning}
        {m.transfer_scanning_status()}
      {:else if transferResult}
        {m.transfer_scanned_success_status()}
      {/if}
    </div>

    <!-- Generate QR Code -->
    <Button
      class="w-full"
      disabled={generating}
      aria-busy={generating}
      variant="outline"
      onclick={handleGenerate}
    >
      {#if generating}
        <IconLoader2 class="animate-spin" />
        {m.transfer_generating_action()}
      {:else}
        <IconQrcode />
        {m.transfer_generate_action()}
      {/if}
    </Button>

    <!-- QR Code display -->
    {#if qrDataUrl}
      <div class="flex flex-col items-center gap-2 rounded-md border p-4">
        <img alt={m.transfer_qr_alt()} class="size-48" src={qrDataUrl} />
        <p class="text-center text-sm text-muted-foreground">
          {m.transfer_scan_instruction()}
        </p>
      </div>
    {/if}

    <!-- Scan QR Code -->
    {#if !scanning}
      <Button class="w-full" variant="outline" onclick={handleScan}>
        <IconCamera />
        {m.transfer_scan_action()}
      </Button>
    {/if}

    <!-- Camera scanner -->
    {#if scanning}
      <div class="relative overflow-hidden rounded-md border" aria-busy="true">
        <video
          bind:this={videoEl}
          class="aspect-square w-full object-cover"
          aria-label={m.transfer_camera_feed_aria()}
        ></video>
        <Button
          class="absolute top-2 right-2"
          size="icon"
          variant="ghost"
          onclick={stopScanning}
          aria-label={m.transfer_close_camera_aria()}
        >
          <Icon.UI type="dismiss" />
        </Button>
      </div>
    {/if}

    <!-- Image fallback -->
    <Button class="w-full text-sm" variant="ghost" onclick={handleImageUpload}>
      <IconPhotoPlus class="size-3" />
      {m.transfer_scan_screenshot_action()}
    </Button>

    <!-- Success -->
    {#if transferResult}
      <div class="rounded-md bg-green-50 p-3 dark:bg-green-950">
        <MergeSummary counts={transferResult} kind="transfer" />
      </div>
    {/if}

    <!-- Error -->
    {#if transferError}
      <div
        class="rounded-md bg-red-50 p-3 text-base text-red-700 dark:bg-red-950 dark:text-red-300"
        role="alert"
      >
        {transferError}
      </div>
    {/if}
  </div>
</DataCard>
