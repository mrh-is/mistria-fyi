import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { encodeTransferPayload } from "$lib/engine/transfer.js";
import { userState } from "$lib/stores/user-state.svelte.js";
import { recordValues } from "$lib/utils.js";

import TransferCard from "./transfer-card.svelte";

const transferQr = vi.hoisted(() => ({
  decodeQrImage: vi.fn(),
  generateTransferQr: vi.fn(),
  startQrCamera: vi.fn(),
}));

vi.mock("./transfer-qr", () => transferQr);

const museumItemId = recordValues(trackerData.museum)
  .flatMap(({ sets }) => recordValues(sets).flatMap(({ items }) => items))
  .at(0);
if (!museumItemId) throw new Error("Tracker data has no museum items");

async function scanImage(file: File) {
  await fireEvent.click(screen.getByRole("button", { name: /scan from a screenshot/i }));
  const input = screen.getByLabelText("Choose an image containing a transfer QR code");
  await fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  transferQr.decodeQrImage.mockReset();
  transferQr.generateTransferQr.mockReset();
  transferQr.startQrCamera.mockReset();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(async () => {
  cleanup();
  userState.resetAll();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

// A marked v10 version byte: recognized as a transfer code, but from an older version.
const OLDER_VERSION_PAYLOAD = "MFGTCg";

describe("TransferCard generate", () => {
  it("renders the QR code for the current progress and announces the in-flight state", async () => {
    let resolveDataUrl: (value: string) => void = () => undefined;
    transferQr.generateTransferQr.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveDataUrl = resolve;
        }),
    );
    userState.toggleMuseumItem(museumItemId);
    render(TransferCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Generate QR Code" }));

    const generating = await screen.findByRole("button", { name: "Generating..." });
    expect(generating).toBeDisabled();
    expect(generating).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Generating QR code…");

    await waitFor(() => {
      expect(transferQr.generateTransferQr).toHaveBeenCalledOnce();
    });
    resolveDataUrl("data:image/png;base64,QUJD");

    expect(await screen.findByRole("img", { name: "Transfer QR Code" })).toHaveAttribute(
      "src",
      "data:image/png;base64,QUJD",
    );
    expect(screen.getByRole("button", { name: "Generate QR Code" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(transferQr.generateTransferQr).toHaveBeenCalledWith(
      await encodeTransferPayload(userState.state.completed),
    );
  });

  it("reports a generation failure and re-enables the action", async () => {
    transferQr.generateTransferQr.mockRejectedValue(new Error("canvas unavailable"));
    render(TransferCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Generate QR Code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to generate QR code: canvas unavailable",
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Generate QR Code" })).toBeEnabled();
  });
});

describe("TransferCard scan from image", () => {
  it("merges a scanned payload and summarizes what was added", async () => {
    userState.toggleMuseumItem(museumItemId);
    const payload = await encodeTransferPayload(userState.state.completed);
    userState.resetAll();
    transferQr.decodeQrImage.mockResolvedValue(payload);
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "qr.png", { type: "image/png" }));

    expect(await screen.findByText("Transferred 1 items!")).toBeInTheDocument();
    expect(screen.getByText("Museum donations: +1")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("QR code scanned successfully.");
    expect(userState.state.completed.museum.has(museumItemId)).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports when the image has no readable QR code", async () => {
    transferQr.decodeQrImage.mockRejectedValue(new Error("No QR code found"));
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "blank.png", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/No QR code found in image/);
  });

  it.each([
    ["an unrelated QR code", "https://example.com", "This QR code isn’t a Mistria Field Guide"],
    // A marked, current (v11) version byte with no checksum.
    ["a damaged transfer code", "MFGTCw", "This QR code’s data is damaged or incomplete."],
  ])("rejects %s without touching progress", async (_, payload, message) => {
    transferQr.decodeQrImage.mockResolvedValue(payload);
    const before = userState.exportState();
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "bogus.png", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(userState.exportState()).toBe(before);
  });

  it("explains how to replace a QR code from an older tracker-data version", async () => {
    transferQr.decodeQrImage.mockResolvedValue(OLDER_VERSION_PAYLOAD);
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "old-qr.png", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This QR code was created by an older version of Mistria Field Guide.",
    );
    expect(screen.getByRole("button", { name: "Copy recovery steps" })).toBeInTheDocument();
  });

  it("resets recovery-copy state before another scan", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    transferQr.decodeQrImage.mockResolvedValue(OLDER_VERSION_PAYLOAD);
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "old-qr.png", { type: "image/png" }));
    await fireEvent.click(screen.getByRole("button", { name: "Copy recovery steps" }));
    expect(
      await screen.findByRole("button", { name: "Recovery steps copied" }),
    ).toBeInTheDocument();

    await scanImage(new File(["png"], "old-qr-again.png", { type: "image/png" }));
    expect(await screen.findByRole("button", { name: "Copy recovery steps" })).toBeInTheDocument();
  });

  it("clears a previous result when a new scan starts", async () => {
    transferQr.decodeQrImage.mockRejectedValue(new Error("No QR code found"));
    render(TransferCard, { open: true });
    await scanImage(new File(["png"], "blank.png", { type: "image/png" }));
    await screen.findByRole("alert");

    await fireEvent.click(screen.getByRole("button", { name: /scan from a screenshot/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});

describe("TransferCard scan from camera", () => {
  function fakeScanner() {
    return { destroy: vi.fn(), stop: vi.fn() };
  }

  it("merges the first decoded frame and releases the camera", async () => {
    userState.toggleMuseumItem(museumItemId);
    const payload = await encodeTransferPayload(userState.state.completed);
    userState.resetAll();
    const scanner = fakeScanner();
    let emit: (data: string) => void = () => undefined;
    transferQr.startQrCamera.mockImplementation(
      (_video: HTMLVideoElement, _overlay: HTMLCanvasElement, onResult: (data: string) => void) => {
        emit = onResult;
        return Promise.resolve(scanner);
      },
    );
    render(TransferCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Scan QR Code" }));
    await waitFor(() => {
      expect(transferQr.startQrCamera).toHaveBeenCalledOnce();
    });
    expect(screen.getByLabelText("Camera feed for QR code scanning")).toBeInTheDocument();
    emit(payload);

    expect(await screen.findByText("Transferred 1 items!")).toBeInTheDocument();
    expect(scanner.stop).toHaveBeenCalledOnce();
    expect(scanner.destroy).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Camera feed for QR code scanning")).toBeNull();
    expect(userState.state.completed.museum.has(museumItemId)).toBe(true);
  });

  it("explains a denied camera permission", async () => {
    transferQr.startQrCamera.mockRejectedValue(
      new DOMException("The request is not allowed by the user agent", "NotAllowedError"),
    );
    render(TransferCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Scan QR Code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Camera access denied. Try scanning from an image instead.",
    );
    expect(screen.getByRole("button", { name: "Scan QR Code" })).toBeInTheDocument();
  });

  it("releases a camera that opens after the scan was cancelled", async () => {
    const scanner = fakeScanner();
    let resolveCamera: (value: typeof scanner) => void = () => undefined;
    transferQr.startQrCamera.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCamera = resolve;
        }),
    );
    render(TransferCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Scan QR Code" }));
    await waitFor(() => {
      expect(transferQr.startQrCamera).toHaveBeenCalledOnce();
    });
    await fireEvent.click(screen.getByRole("button", { name: "Close camera" }));
    resolveCamera(scanner);

    await waitFor(() => {
      expect(scanner.stop).toHaveBeenCalledOnce();
    });
    expect(scanner.destroy).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Scan QR Code" })).toBeInTheDocument();
  });
});
