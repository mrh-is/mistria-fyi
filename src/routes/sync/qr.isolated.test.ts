import { encodeQR } from "qr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateFollowQr, QR_OPTIONS, qrDisplayPixels, startQrCamera } from "./qr.js";

const svgToPng = vi.hoisted(() => vi.fn(() => Promise.resolve("data:image/png;base64,QUJD")));
const camera = vi.hoisted(() => ({
  cancel: vi.fn(),
  clear: vi.fn(),
  frame: undefined as (() => void) | undefined,
  readFrame: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("qr/dom.js", () => ({
  frameLoop: (frame: () => void) => {
    camera.frame = frame;
    return camera.cancel;
  },
  QRCamera: class {
    readFrame = camera.readFrame;
    stop = camera.stop;
  },
  QRCanvas: class {
    clear = camera.clear;
  },
  svgToPng,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("generateFollowQr", () => {
  it("renders the PNG at twice the display size", async () => {
    const payload = "x".repeat(400);
    const modules = encodeQR(payload, "raw", QR_OPTIONS).length;
    const displayPixels = qrDisplayPixels(modules);

    await expect(generateFollowQr(payload)).resolves.toEqual({
      dataUrl: "data:image/png;base64,QUJD",
      displayPixels,
    });
    expect(svgToPng).toHaveBeenCalledWith(
      encodeQR(payload, "svg", QR_OPTIONS),
      displayPixels * 2,
      displayPixels * 2,
    );
  });
});

it("keeps QR modules on whole pixels at a readable size", () => {
  expect(qrDisplayPixels(25)).toBe(200);
  expect(qrDisplayPixels(101)).toBe(505);
});

it("scans a follow link once and releases the camera", async () => {
  const getUserMedia = vi.fn().mockResolvedValue({});
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "green" }));
  const video = { srcObject: {} } as HTMLVideoElement;
  const overlay = {} as HTMLCanvasElement;
  const onResult = vi.fn();
  camera.readFrame.mockResolvedValue("https://mistria.fyi/en/sync#follow-link");

  const scanner = await startQrCamera(video, overlay, onResult);
  expect(getUserMedia).toHaveBeenCalledWith({
    video: { facingMode: "environment", height: { ideal: 1080 }, width: { ideal: 1920 } },
  });
  expect(camera.frame).toBeTypeOf("function");
  camera.frame?.();
  await vi.waitFor(() => {
    expect(onResult).toHaveBeenCalledTimes(1);
  });
  camera.frame?.();
  expect(onResult).toHaveBeenCalledWith("https://mistria.fyi/en/sync#follow-link");
  expect(camera.readFrame).toHaveBeenCalledExactlyOnceWith(expect.anything(), true);

  scanner.stop();
  scanner.destroy();
  expect(camera.cancel).toHaveBeenCalledTimes(1);
  expect(camera.stop).toHaveBeenCalledTimes(1);
  expect(camera.clear).toHaveBeenCalledTimes(1);
  expect(video.srcObject).toBeNull();
});
