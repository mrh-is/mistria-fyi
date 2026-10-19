import { encodeQR } from "qr";
import { describe, expect, it, vi } from "vitest";

import { generateTransferQr, TRANSFER_QR_OPTIONS, transferQrDisplayPixels } from "./transfer-qr.js";

const svgToPng = vi.hoisted(() => vi.fn(() => Promise.resolve("data:image/png;base64,QUJD")));
vi.mock("qr/dom.js", () => ({
  frameLoop: vi.fn(),
  QRCanvas: vi.fn(),
  rearCamera: vi.fn(),
  svgToPng,
}));

describe("generateTransferQr", () => {
  it("renders the PNG at twice the display size", async () => {
    const payload = "x".repeat(400);
    const modules = encodeQR(payload, "raw", TRANSFER_QR_OPTIONS).length;
    const displayPixels = transferQrDisplayPixels(modules);

    await expect(generateTransferQr(payload)).resolves.toEqual({
      dataUrl: "data:image/png;base64,QUJD",
      displayPixels,
    });
    expect(svgToPng).toHaveBeenCalledWith(
      encodeQR(payload, "svg", TRANSFER_QR_OPTIONS),
      displayPixels * 2,
      displayPixels * 2,
    );
  });
});
