import { encodeQR } from "qr";
import { frameLoop, QRCamera, QRCanvas, svgToPng } from "qr/dom.js";

import type { QrOpts } from "qr";

/** A running camera scanner: `stop` ends decoding & the stream, `destroy` clears the overlay. */
export interface ClosableScanner {
  destroy: () => void;
  stop: () => void;
}

/** Stops & destroys `scanner` if one is running; returns `null` to clear the caller's reference. */
export function closeScanner(scanner: ClosableScanner | null): null {
  scanner?.stop();
  scanner?.destroy();
  return null;
}

/** Low error correction keeps follow links at the smallest QR version. */
export const QR_OPTIONS = { border: 2, ecc: "low" } as const satisfies QrOpts;

/** Smallest displayed edge, in CSS pixels, so a short payload doesn't render as a speck. */
const MIN_QR_CSS_PIXELS = 192;

/**
 * Target CSS pixels per module; below this, phone cameras struggle to resolve a dense code. The
 * card width caps the displayed size, so the densest codes still render smaller.
 */
const TARGET_CSS_PIXELS_PER_MODULE = 5;

/**
 * Camera resolution to request. The library's default asks for the screen's CSS size, which leaves
 * a dense code about one camera pixel per module.
 */
const CAMERA_CONSTRAINTS = {
  facingMode: "environment",
  height: { ideal: 1080 },
  width: { ideal: 1920 },
} as const satisfies MediaTrackConstraints;

/** PNG pixels per CSS pixel, so the code stays sharp on high-density displays. */
const PNG_PIXEL_DENSITY = 2;

/** A rendered follow code and the edge length, in CSS pixels, to display it at. */
export interface FollowQr {
  dataUrl: string;
  displayPixels: number;
}

/**
 * Preferred display edge, in CSS pixels, for a code `modules` wide: a whole number of pixels per
 * module, at least `TARGET_CSS_PIXELS_PER_MODULE`, and never smaller than `MIN_QR_CSS_PIXELS`.
 */
export function qrDisplayPixels(modules: number): number {
  return modules * Math.max(TARGET_CSS_PIXELS_PER_MODULE, Math.ceil(MIN_QR_CSS_PIXELS / modules));
}

/** Renders the payload as a PNG data URL, sized so each module spans whole pixels. */
export async function generateFollowQr(payload: string): Promise<FollowQr> {
  const modules = encodeQR(payload, "raw", QR_OPTIONS).length;
  const displayPixels = qrDisplayPixels(modules);
  const pngPixels = displayPixels * PNG_PIXEL_DENSITY;
  const svg = encodeQR(payload, "svg", QR_OPTIONS);
  return { dataUrl: await svgToPng(svg, pngPixels, pngPixels), displayPixels };
}

/**
 * Streams the rear camera into `video`, decoding each frame until `onResult` receives a code.
 * `overlay` is a canvas laid over the video; it dims the area outside the square scan region and
 * outlines a detected code. Rejects when the camera can't be opened (e.g. permission denied).
 */
export async function startQrCamera(
  video: HTMLVideoElement,
  overlay: HTMLCanvasElement,
  onResult: (data: string) => void,
): Promise<ClosableScanner> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: CAMERA_CONSTRAINTS });
  const camera = new QRCamera(video, stream);
  const accent = getComputedStyle(overlay).getPropertyValue("--primary").trim() || "green";
  const canvas = new QRCanvas(
    { overlay },
    { overlayAlignerColor: accent, overlayFinderColor: accent, overlayMainColor: accent },
  );

  let reading = false;
  let found = false;
  async function readFrame(): Promise<void> {
    try {
      // Decode the camera's own pixels, not the frame resampled to the on-screen video size.
      const result = await camera.readFrame(canvas, true);
      if (typeof result !== "string" || found) return;
      found = true;
      onResult(result);
    } catch {
      // A frame without a readable code is a miss, not a failure; the next frame retries.
    } finally {
      reading = false;
    }
  }

  const cancelLoop = frameLoop(() => {
    if (reading || found) return;
    reading = true;
    void readFrame();
  });

  return {
    destroy() {
      canvas.clear();
      video.srcObject = null;
    },
    stop() {
      found = true;
      cancelLoop();
      camera.stop();
    },
  };
}
