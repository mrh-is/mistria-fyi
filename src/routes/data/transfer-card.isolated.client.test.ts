import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { encodeTransferPayload } from "#lib/engine/transfer.js";
import { createSafeReload, SAFE_RELOAD_POLL_MS } from "#lib/pwa/safe-reload.js";
import { updateHolds } from "#lib/pwa/update-holds.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordValues } from "#lib/utils/record.js";
import { version } from "$app/env";

import TransferCard from "./transfer-card.svelte";

import type { SafeReload } from "#lib/pwa/safe-reload.js";
import type { ProgressState } from "#lib/types/user-progress.js";

import type { TransferQr } from "./transfer-qr.js";

const transferQr = vi.hoisted(() => ({
  decodeQrImage: vi.fn(),
  generateTransferQr: vi.fn(),
  startQrCamera: vi.fn(),
}));
let scheduler: SafeReload | undefined;

vi.mock("./transfer-qr.js", () => transferQr);

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

afterEach(async () => {
  scheduler?.stop();
  scheduler = undefined;
  cleanup();
  // The file picker is appended to body and can outlive a canceled scan.
  for (const input of document.querySelectorAll('input[name="transfer-image"]')) input.remove();
  userState.resetAll();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  await tick();
});

/** A transfer code for the current progress from a build other than the running one. */
async function otherBuildPayload(): Promise<string> {
  return encodeTransferPayload(userState.state.progress, `${version} (other)`);
}

describe("TransferCard generate", () => {
  it("renders the QR code for the current progress and announces the in-flight state", async () => {
    let resolveQr: ((value: TransferQr) => void) | undefined;
    transferQr.generateTransferQr.mockImplementation(
      () =>
        new Promise<TransferQr>((resolve) => {
          resolveQr = resolve;
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
      expect(transferQr.generateTransferQr).toHaveBeenCalledTimes(1);
    });
    resolveQr?.({ dataUrl: "data:image/png;base64,QUJD", displayPixels: 505 });

    const image = await screen.findByRole("img", { name: "Transfer QR Code" });
    expect(image).toHaveAttribute("src", "data:image/png;base64,QUJD");
    expect(image).toHaveAttribute("width", "505");
    expect(image).toHaveAttribute("height", "505");
    expect(screen.getByRole("button", { name: "Generate QR Code" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(transferQr.generateTransferQr).toHaveBeenCalledWith(
      await encodeTransferPayload(userState.state.progress, version),
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
    const payload = await encodeTransferPayload(userState.state.progress, version);
    userState.resetAll();
    transferQr.decodeQrImage.mockResolvedValue(payload);
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "qr.png", { type: "image/png" }));

    expect(await screen.findByText("Transferred 1 items!")).toBeInTheDocument();
    expect(screen.getByText("Museum donations: +1")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("QR code scanned successfully.");
    expect(userState.state.progress.museum.has(museumItemId)).toBe(true);
    // A transfer carries no provenance, so what it adds isn't credited to a save.
    expect(userState.provenanceOf(`museum/${museumItemId}`)).toEqual({ source: "unknown" });
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
    // A marked code too short to hold a build fingerprint.
    ["a damaged transfer code", "MFGTAQ", "This QR code’s data is damaged or incomplete."],
  ])("rejects %s without touching progress", async (_, payload, message) => {
    transferQr.decodeQrImage.mockResolvedValue(payload);
    const before = userState.exportBackup();
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "bogus.png", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(userState.exportBackup()).toBe(before);
  });

  it("explains how to replace a QR code from a different app version", async () => {
    transferQr.decodeQrImage.mockResolvedValue(await otherBuildPayload());
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "old-qr.png", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This QR code was created by a different version of Mistria Field Guide.",
    );
    expect(screen.getByRole("button", { name: "Copy recovery steps" })).toBeInTheDocument();
  });

  it("resets recovery-copy state before another scan", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    transferQr.decodeQrImage.mockResolvedValue(await otherBuildPayload());
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

function fakeScanner() {
  return { destroy: vi.fn(), stop: vi.fn() };
}

describe("TransferCard update holds", () => {
  it("holds a pending update from a camera result through payload decoding & the result", async () => {
    const decoded = Promise.withResolvers<Partial<ProgressState>>();
    const transfer = await import("#lib/engine/transfer.js");
    vi.spyOn(transfer, "decodeTransferPayload").mockReturnValueOnce(decoded.promise);
    let emit: ((data: string) => void) | undefined;
    transferQr.startQrCamera.mockImplementation(
      (_video: HTMLVideoElement, _overlay: HTMLCanvasElement, onResult: (data: string) => void) => {
        emit = onResult;
        return Promise.resolve(fakeScanner());
      },
    );
    render(TransferCard, { open: true });
    await fireEvent.click(screen.getByRole("button", { name: "Scan QR Code" }));
    await waitFor(() => {
      expect(emit).toBeDefined();
    });
    vi.useFakeTimers();
    const reload = vi.fn();
    scheduler = createSafeReload({ isReachable: () => Promise.resolve(true), reload });
    scheduler.request();

    emit?.("camera payload");
    await vi.advanceTimersByTimeAsync(SAFE_RELOAD_POLL_MS * 2);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(updateHolds.held).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    decoded.resolve({ museum: new Set([museumItemId]) });
    await vi.advanceTimersByTimeAsync(SAFE_RELOAD_POLL_MS);
    expect(userState.state.progress.museum.has(museumItemId)).toBe(true);
    expect(updateHolds.held).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    cleanup();
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("holds a pending update through image decoding, payload decoding, & the result", async () => {
    const image = Promise.withResolvers<string>();
    const decoded = Promise.withResolvers<Partial<ProgressState>>();
    const transfer = await import("#lib/engine/transfer.js");
    vi.spyOn(transfer, "decodeTransferPayload").mockReturnValueOnce(decoded.promise);
    transferQr.decodeQrImage.mockReturnValueOnce(image.promise);
    render(TransferCard, { open: true });
    vi.useFakeTimers();
    const reload = vi.fn();
    await scanImage(new File(["png"], "qr.png", { type: "image/png" }));
    scheduler = createSafeReload({ isReachable: () => Promise.resolve(true), reload });
    scheduler.request();

    await vi.advanceTimersByTimeAsync(SAFE_RELOAD_POLL_MS * 2);
    expect(updateHolds.held).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    image.resolve("image payload");
    await vi.advanceTimersByTimeAsync(SAFE_RELOAD_POLL_MS);
    expect(transfer.decodeTransferPayload).toHaveBeenCalledWith("image payload", version);
    expect(updateHolds.held).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    decoded.resolve({ museum: new Set([museumItemId]) });
    await vi.advanceTimersByTimeAsync(SAFE_RELOAD_POLL_MS);
    expect(userState.state.progress.museum.has(museumItemId)).toBe(true);
    expect(updateHolds.held).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    cleanup();
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("TransferCard scan from camera", () => {
  it("merges the first decoded frame and releases the camera", async () => {
    userState.toggleMuseumItem(museumItemId);
    const payload = await encodeTransferPayload(userState.state.progress, version);
    userState.resetAll();
    const scanner = fakeScanner();
    let emit: ((data: string) => void) | undefined;
    transferQr.startQrCamera.mockImplementation(
      (_video: HTMLVideoElement, _overlay: HTMLCanvasElement, onResult: (data: string) => void) => {
        emit = onResult;
        return Promise.resolve(scanner);
      },
    );
    render(TransferCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Scan QR Code" }));
    await waitFor(() => {
      expect(transferQr.startQrCamera).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByLabelText("Camera feed for QR code scanning")).toBeInTheDocument();
    emit?.(payload);

    expect(await screen.findByText("Transferred 1 items!")).toBeInTheDocument();
    expect(scanner.stop).toHaveBeenCalledTimes(1);
    expect(scanner.destroy).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Camera feed for QR code scanning")).toBeNull();
    expect(userState.state.progress.museum.has(museumItemId)).toBe(true);
  });

  it("opens the scanner full-screen and closes it with Escape", async () => {
    const scanner = fakeScanner();
    transferQr.startQrCamera.mockResolvedValue(scanner);
    render(TransferCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Scan QR Code" }));
    const dialog = await screen.findByRole("dialog", { name: "Scan QR Code" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close camera" })).toHaveFocus();
    });

    await fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(scanner.stop).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Scan QR Code" })).toHaveFocus();
    });
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
    let resolveCamera: ((value: typeof scanner) => void) | undefined;
    transferQr.startQrCamera.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCamera = resolve;
        }),
    );
    render(TransferCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Scan QR Code" }));
    await waitFor(() => {
      expect(transferQr.startQrCamera).toHaveBeenCalledTimes(1);
    });
    await fireEvent.click(screen.getByRole("button", { name: "Close camera" }));
    resolveCamera?.(scanner);

    await waitFor(() => {
      expect(scanner.stop).toHaveBeenCalledTimes(1);
    });
    expect(scanner.destroy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Scan QR Code" })).toBeInTheDocument();
  });
});
