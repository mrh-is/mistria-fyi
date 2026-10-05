import encodeQR, { type QrOpts } from "qr";
import decodeQR from "qr/decode.js";
import { frameLoop, QRCanvas, rearCamera, svgToPng } from "qr/dom.js";

import type { ClosableScanner } from "./data-effects.js";

/** Transfer payloads are long, so low error correction keeps the code at the smallest version. */
export const TRANSFER_QR_OPTIONS = { border: 2, ecc: "low" } as const satisfies QrOpts;

/** Smallest rendered edge, in pixels, for the generated PNG. */
const MIN_QR_PIXELS = 300;

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

/** Renders the payload as a PNG data URL, scaled by a whole number of pixels per module. */
export async function generateTransferQr(payload: string): Promise<string> {
  const modules = encodeQR(payload, "raw", TRANSFER_QR_OPTIONS).length;
  const pixels = modules * Math.ceil(MIN_QR_PIXELS / modules);
  return svgToPng(encodeQR(payload, "svg", TRANSFER_QR_OPTIONS), pixels, pixels);
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
  const cancelLoop = frameLoop(() => {
    if (reading || found) return;
    reading = true;
    camera
      .readFrame(canvas)
      .then((result) => {
        if (typeof result !== "string" || found) return;
        found = true;
        onResult(result);
      })
      // A frame without a readable code is a miss, not a failure; the next frame retries.
      .catch(() => undefined)
      .finally(() => {
        reading = false;
      });
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
