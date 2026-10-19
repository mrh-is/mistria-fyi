import { encodeQR } from "qr";
import { decodeQR } from "qr/decode.js";
import { frameLoop, QRCanvas, rearCamera, svgToPng } from "qr/dom.js";

import type { QrOpts } from "qr";

import type { ClosableScanner } from "./data-effects.js";

/** Transfer payloads are long, so low error correction keeps the code at the smallest version. */
export const TRANSFER_QR_OPTIONS = { border: 2, ecc: "low" } as const satisfies QrOpts;

/** Smallest displayed edge, in CSS pixels, so a short payload doesn't render as a speck. */
const MIN_QR_CSS_PIXELS = 192;

/**
 * Target CSS pixels per module; below this, phone cameras struggle to resolve a dense code. The
 * card width caps the displayed size, so the densest codes still render smaller.
 */
const TARGET_CSS_PIXELS_PER_MODULE = 5;

/** PNG pixels per CSS pixel, so the code stays sharp on high-density displays. */
const PNG_PIXEL_DENSITY = 2;

/** A rendered transfer code and the edge length, in CSS pixels, to display it at. */
export interface TransferQr {
  dataUrl: string;
  displayPixels: number;
}

/**
 * Preferred display edge, in CSS pixels, for a code `modules` wide: a whole number of pixels per
 * module, at least `TARGET_CSS_PIXELS_PER_MODULE`, and never smaller than `MIN_QR_CSS_PIXELS`.
 */
export function transferQrDisplayPixels(modules: number): number {
  return modules * Math.max(TARGET_CSS_PIXELS_PER_MODULE, Math.ceil(MIN_QR_CSS_PIXELS / modules));
}

/** Decodes the QR code in an image file. Throws when the image has none. */
export async function decodeQrImage(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D context unavailable");
    context.drawImage(bitmap, 0, 0);
    // A still image has no frame budget, so let the decoder try every retry.
    return decodeQR(context.getImageData(0, 0, bitmap.width, bitmap.height), {
      effort: Infinity,
      timeLimit: Infinity,
    });
  } finally {
    bitmap.close();
  }
}

/** Renders the payload as a PNG data URL, sized so each module spans whole pixels. */
export async function generateTransferQr(payload: string): Promise<TransferQr> {
  const modules = encodeQR(payload, "raw", TRANSFER_QR_OPTIONS).length;
  const displayPixels = transferQrDisplayPixels(modules);
  const pngPixels = displayPixels * PNG_PIXEL_DENSITY;
  const svg = encodeQR(payload, "svg", TRANSFER_QR_OPTIONS);
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
  const camera = await rearCamera(video);
  const accent = getComputedStyle(overlay).getPropertyValue("--primary").trim() || "green";
  const canvas = new QRCanvas(
    { overlay },
    { overlayAlignerColor: accent, overlayFinderColor: accent, overlayMainColor: accent },
  );

  let reading = false;
  let found = false;
  async function readFrame(): Promise<void> {
    try {
      const result = await camera.readFrame(canvas);
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
