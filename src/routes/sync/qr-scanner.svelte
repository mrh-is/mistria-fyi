<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import { Icon } from "#lib/components/icon/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as m from "#lib/paraglide/messages.js";

  import { closeScanner } from "../data/data-effects.js";
  import { startQrCamera } from "../data/transfer-qr.js";

  import type { ClosableScanner } from "../data/data-effects.js";

  let {
    onclose,
    onerror,
    onresult,
  }: {
    onclose: () => void;
    onerror: (message: string) => void;
    onresult: (data: string) => void;
  } = $props();

  let video = $state<HTMLVideoElement>();
  let overlay = $state<HTMLCanvasElement>();
  let closeButton = $state<HTMLButtonElement | null>(null);
  let scanner: ClosableScanner | null = null;
  let closed = false;

  async function start(): Promise<void> {
    if (!video || !overlay) {
      onerror(m.transfer_error_camera_init());
      return;
    }
    let started: ClosableScanner;
    try {
      started = await startQrCamera(video, overlay, (data) => {
        scanner = closeScanner(scanner);
        onresult(data);
      });
    } catch (error) {
      const denied =
        (error instanceof Error || error instanceof DOMException) &&
        error.name === "NotAllowedError";
      onerror(denied ? m.transfer_error_camera_denied() : m.transfer_error_camera_init());
      return;
    }
    // The scanner closed while the camera permission prompt was open.
    if (closed) {
      closeScanner(started);
      return;
    }
    scanner = started;
    closeButton?.focus();
  }

  onMount(() => {
    void start();
  });

  onDestroy(() => {
    closed = true;
    scanner = closeScanner(scanner);
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape") onclose();
  }}
/>

<!-- Full-screen, as the transfer card's scanner is, so the code can fill the scan region. -->
<div
  class="fixed inset-0 z-50 grid place-items-center bg-black"
  role="dialog"
  aria-modal="true"
  aria-label={m.sync_scan()}
>
  <div class="relative">
    <video
      bind:this={video}
      class="block max-h-dvh max-w-full"
      aria-label={m.transfer_camera_feed_aria()}
      autoplay
      muted
      playsinline
    ></video>
    <canvas
      bind:this={overlay}
      class="pointer-events-none absolute inset-0 size-full opacity-50"
      aria-hidden="true"
    ></canvas>
  </div>
  <Button
    bind:ref={closeButton}
    class="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3"
    size="icon"
    variant="secondary"
    onclick={onclose}
    aria-label={m.transfer_close_camera_aria()}
  >
    <Icon.UI type="dismiss" />
  </Button>
</div>
