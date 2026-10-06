<script lang="ts">
  import IconCamera from "@tabler/icons-svelte-runes/icons/camera";
  import IconLoader2 from "@tabler/icons-svelte-runes/icons/loader-2";
  import IconPhotoPlus from "@tabler/icons-svelte-runes/icons/photo-plus";
  import IconQrcode from "@tabler/icons-svelte-runes/icons/qrcode";

  import { Icon } from "#lib/components/icon/index.js";
  import StatusNote from "#lib/components/status-note.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    decodeTransferPayload,
    encodeTransferPayload,
    TransferDecodeError,
  } from "#lib/engine/transfer.js";
  import * as m from "#lib/paraglide/messages.js";
  import { userState } from "#lib/stores/user-state.svelte.js";

  import DataCard from "./data-card.svelte";
  import { closeScanner } from "./data-effects.js";
  import { formatTransferDecodeError } from "./data-error-messages.js";
  import MergeSummary from "./merge-summary.svelte";
  import { decodeQrImage, generateTransferQr, startQrCamera } from "./transfer-qr.js";

  import type { MergeResult } from "#lib/types/user-progress.js";

  import type { ClosableScanner } from "./data-effects.js";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  // ── State ──
  let generating = $state(false);
  let qrDataUrl = $state<null | string>(null);

  let scanning = $state(false);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let overlayEl = $state<HTMLCanvasElement | null>(null);
  let scanner: ClosableScanner | null = null;
  let scanAttempt = 0;

  let transferResult = $state<MergeResult | null>(null);
  let transferError = $state<null | string>(null);
  let outdatedTransfer = $state(false);
  let copiedRecoverySteps = $state(false);

  // ── Generate QR Code ──
  async function handleGenerate() {
    generating = true;
    qrDataUrl = null;
    transferResult = null;
    transferError = null;
    outdatedTransfer = false;
    copiedRecoverySteps = false;

    try {
      const payload = await encodeTransferPayload(userState.state.completed);
      qrDataUrl = await generateTransferQr(payload);
    } catch (error) {
      transferError = `${m.transfer_error_generate_prefix()} ${error instanceof Error ? error.message : m.transfer_unknown_error()}`;
    } finally {
      generating = false;
    }
  }

  // ── Scan QR Code (camera) ──
  async function handleScan() {
    const attempt = ++scanAttempt;
    transferResult = null;
    transferError = null;
    outdatedTransfer = false;
    copiedRecoverySteps = false;
    qrDataUrl = null;
    scanning = true;

    // Wait for video element to bind
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    if (!isCurrentScan(attempt)) return;

    if (!videoEl || !overlayEl) {
      transferError = m.transfer_error_camera_init();
      scanning = false;
      return;
    }

    try {
      const started = await startQrCamera(videoEl, overlayEl, (data) => {
        void handleScanResult(data);
      });
      // The card closed or another scan started while the camera permission prompt was open.
      if (!isCurrentScan(attempt)) {
        closeScanner(started);
        return;
      }
      scanner = started;
    } catch (error) {
      if (attempt !== scanAttempt) return;
      scanning = false;
      transferError = isCameraPermissionError(error)
        ? m.transfer_error_camera_denied()
        : `${m.transfer_error_camera_prefix()} ${error instanceof Error ? error.message : m.transfer_error_unknown_camera()}`;
    }
  }

  function isCameraPermissionError(error: unknown) {
    // getUserMedia rejects with a DOMException; not every environment makes that an Error.
    if (!(error instanceof Error || error instanceof DOMException)) return false;
    return error.name === "NotAllowedError" || error.message.toLowerCase().includes("permission");
  }

  // A scan goes stale when the card closes or another scan starts during an await.
  function isCurrentScan(attempt: number) {
    return open && attempt === scanAttempt;
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

  async function copyRecoverySteps(): Promise<void> {
    try {
      await navigator.clipboard.writeText(m.transfer_error_outdated_recovery());
      copiedRecoverySteps = true;
    } catch {
      // Clipboard access can be denied or unavailable; the steps stay visible either way.
    }
  }

  // ── Scan from image file ──
  function handleImageUpload() {
    transferResult = null;
    transferError = null;
    outdatedTransfer = false;
    copiedRecoverySteps = false;
    qrDataUrl = null;

    const input = document.createElement("input");
    input.type = "file";
    input.name = "transfer-image";
    input.setAttribute("aria-label", m.transfer_image_upload_aria());
    input.accept = "image/*";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const data = await decodeQrImage(file);
        await handleScanResult(data);
      } catch {
        transferError = m.transfer_error_no_qr_in_image();
      }
    });
    input.className = "sr-only";
    input.addEventListener("cancel", () => {
      input.remove();
    });
    document.body.append(input);
    input.click();
  }

  // ── Common decode + merge ──
  async function handleScanResult(data: string) {
    stopScanning();
    try {
      const decoded = await decodeTransferPayload(data);
      transferResult = userState.mergeFromSave(decoded);
    } catch (error) {
      if (!(error instanceof TransferDecodeError)) {
        transferError = `${m.transfer_error_invalid_qr_prefix()} ${m.transfer_error_could_not_decode()}`;
      } else if (error.code === "outdated") {
        outdatedTransfer = true;
      } else {
        transferError = formatTransferDecodeError(error.code);
      }
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
        <!-- The video keeps its natural aspect ratio so the overlay's coordinates match the frame
             the decoder reads. -->
        <video
          bind:this={videoEl}
          class="block w-full"
          aria-label={m.transfer_camera_feed_aria()}
          autoplay
          muted
          playsinline
        ></video>
        <canvas
          bind:this={overlayEl}
          class="pointer-events-none absolute inset-0 size-full opacity-50"
          aria-hidden="true"
        ></canvas>
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
      <StatusNote tone="success">
        <MergeSummary
          conflicts={transferResult.conflicts}
          counts={transferResult.counts}
          kind="transfer"
        />
      </StatusNote>
    {/if}

    <!-- Error -->
    {#if outdatedTransfer}
      <StatusNote class="flex flex-col gap-3 text-base" tone="warning">
        <p class="font-medium">{m.transfer_error_outdated_title()}</p>
        <p>{m.transfer_error_outdated_recovery()}</p>
        <Button class="self-start" size="sm" variant="outline" onclick={copyRecoverySteps}>
          {copiedRecoverySteps
            ? m.transfer_error_outdated_copied()
            : m.transfer_error_outdated_copy_steps()}
        </Button>
      </StatusNote>
    {:else if transferError}
      <StatusNote class="text-base" tone="error">
        {transferError}
      </StatusNote>
    {/if}
  </div>
</DataCard>
