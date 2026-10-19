import { encodeQR } from "qr";
import { decodeQR } from "qr/decode.js";
import { afterEach, describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { encodeTransferPayload } from "#lib/engine/transfer.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordValues } from "#lib/utils/record.js";

import { TRANSFER_QR_OPTIONS, transferQrDisplayPixels } from "./transfer-qr.js";

/** Paints a module matrix as black-on-white RGBA pixels, `scale` pixels per module. */
function rasterize(matrix: boolean[][], scale: number) {
  const size = matrix.length * scale;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dark = matrix[Math.floor(y / scale)]?.[Math.floor(x / scale)] ?? false;
      const offset = (y * size + x) * 4;
      data.fill(dark ? 0 : 255, offset, offset + 3);
      data[offset + 3] = 255;
    }
  }
  return { data, height: size, width: size };
}

afterEach(() => {
  userState.resetAll();
});

describe("transfer QR codes", () => {
  it("round-trips a large transfer payload through encoding and decoding", async () => {
    for (const { sets } of recordValues(trackerData.museum)) {
      for (const { items } of recordValues(sets)) {
        for (const item of items) userState.toggleMuseumItem(item);
      }
    }
    const payload = await encodeTransferPayload(userState.state.progress, "2026.10.04 (abcdef12)");
    const matrix = encodeQR(payload, "raw", TRANSFER_QR_OPTIONS);

    expect(decodeQR(rasterize(matrix, 3))).toBe(payload);
  });
});

describe("transfer QR display size", () => {
  it("targets five CSS pixels per module for a dense code", () => {
    expect(transferQrDisplayPixels(101)).toBe(505);
    expect(transferQrDisplayPixels(181)).toBe(905);
  });

  it("keeps a sparse code at a readable minimum with whole pixels per module", () => {
    expect(transferQrDisplayPixels(25)).toBe(200);
  });
});
