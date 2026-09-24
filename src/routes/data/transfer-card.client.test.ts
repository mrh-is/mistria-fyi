import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { Blob as NodeBlob } from "node:buffer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { encodeTransferPayload } from "$lib/engine/transfer.js";
import { userState } from "$lib/stores/user-state.svelte.js";
import { recordValues } from "$lib/utils.js";

import TransferCard from "./transfer-card.svelte";

const qrcode = vi.hoisted(() => ({ toDataURL: vi.fn() }));
const qrScanner = vi.hoisted(() => ({ scanImage: vi.fn() }));

vi.mock("qrcode", () => ({ default: qrcode }));
vi.mock("qr-scanner", () => ({ default: Object.assign(vi.fn(), qrScanner) }));

const museumItemId = recordValues(trackerData.museum)
  .flatMap(({ sets }) => recordValues(sets).flatMap(({ items }) => items))
  .at(0);
if (!museumItemId) throw new Error("Tracker data has no museum items");

async function scanImage(file: File) {
  await fireEvent.click(screen.getByRole("button", { name: /scan from a screenshot/i }));
  const input = screen.getByLabelText("Choose an image containing a transfer QR code");
  await fireEvent.change(input, { target: { files: [file] } });
}

// jsdom's Blob has no `stream()`, which the transfer codec needs for compression. Node's Blob does.
beforeAll(() => {
  vi.stubGlobal("Blob", NodeBlob);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  qrcode.toDataURL.mockReset();
  qrScanner.scanImage.mockReset();
});

afterEach(async () => {
  cleanup();
  userState.resetAll();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

describe("TransferCard generate", () => {
  it("renders the QR code for the current progress and announces the in-flight state", async () => {
    let resolveDataUrl: (value: string) => void = () => undefined;
    qrcode.toDataURL.mockImplementation(
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
      expect(qrcode.toDataURL).toHaveBeenCalledOnce();
    });
    resolveDataUrl("data:image/png;base64,QUJD");

    expect(await screen.findByRole("img", { name: "Transfer QR Code" })).toHaveAttribute(
      "src",
      "data:image/png;base64,QUJD",
    );
    expect(screen.getByRole("button", { name: "Generate QR Code" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(qrcode.toDataURL).toHaveBeenCalledWith(
      await encodeTransferPayload(userState.state.completed),
      expect.objectContaining({ errorCorrectionLevel: "L" }),
    );
  });

  it("reports a generation failure and re-enables the action", async () => {
    qrcode.toDataURL.mockRejectedValue(new Error("canvas unavailable"));
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
    qrScanner.scanImage.mockResolvedValue({ data: payload });
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "qr.png", { type: "image/png" }));

    expect(await screen.findByText("Transferred 1 items!")).toBeInTheDocument();
    expect(screen.getByText("Museum donations: +1")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("QR code scanned successfully.");
    expect(userState.state.completed.museum.has(museumItemId)).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports when the image has no readable QR code", async () => {
    qrScanner.scanImage.mockRejectedValue(new Error("No QR code found"));
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "blank.png", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/No QR code found in image/);
  });

  it("rejects a payload it cannot decode without touching progress", async () => {
    qrScanner.scanImage.mockResolvedValue({ data: "not-a-transfer-payload" });
    const before = userState.exportState();
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "bogus.png", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/^Invalid QR code:/);
    expect(userState.exportState()).toBe(before);
  });

  it("explains how to replace a QR code from an older tracker-data version", async () => {
    qrScanner.scanImage.mockResolvedValue({
      data: "CSG9unJjYBgFVAYpDCln0IENDAycsxoYWiZ5qkxgcKCnpQA",
    });
    render(TransferCard, { open: true });

    await scanImage(new File(["png"], "old-qr.png", { type: "image/png" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This QR code was created by an older version of Mistria Field Guide.",
    );
    expect(screen.getByRole("button", { name: "Copy recovery steps" })).toBeInTheDocument();
  });

  it("resets recovery-copy state before another scan", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    qrScanner.scanImage.mockResolvedValue({
      data: "CSG9unJjYBgFVAYpDCln0IENDAycsxoYWiZ5qkxgcKCnpQA",
    });
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
    qrScanner.scanImage.mockRejectedValue(new Error("No QR code found"));
    render(TransferCard, { open: true });
    await scanImage(new File(["png"], "blank.png", { type: "image/png" }));
    await screen.findByRole("alert");

    await fireEvent.click(screen.getByRole("button", { name: /scan from a screenshot/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
