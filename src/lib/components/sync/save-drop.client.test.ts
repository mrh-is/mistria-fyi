import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import SaveDrop from "./save-drop.svelte";

import type { SaveSource } from "#lib/sync/save-source.js";

const FILE = new File(["save"], "game-1-autosave.sav");

/** A clipboard or drag payload, as a browser hands it over during the event. */
function transfer({ handle, kind = "file" }: { handle?: object; kind?: string } = {}) {
  const item = {
    getAsFile: () => (kind === "file" ? FILE : null),
    kind,
    ...(handle ? { getAsFileSystemHandle: () => Promise.resolve(handle) } : {}),
  };
  return { files: kind === "file" ? [FILE] : [], items: [item] };
}

function paste(payload: unknown, target: EventTarget = document.body): boolean {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: payload });
  return target.dispatchEvent(event);
}

/** Makes this browser one with file handles, or one without, like Firefox. */
function givesHandles(gives: boolean): void {
  vi.stubGlobal("DataTransferItem", {
    prototype: gives ? { getAsFileSystemHandle: vi.fn() } : {},
  });
}

function renderDrop(
  options: { locked?: boolean; platform?: "linux" | "mac" | "windows" } = {},
  onsource = vi.fn<(source: SaveSource) => Promise<void>>(() => Promise.resolve()),
) {
  render(SaveDrop, { label: "Drop it here", onsource, platform: "windows", ...options });
  return onsource;
}

afterEach(async () => {
  cleanup();
  await tick();
  vi.unstubAllGlobals();
});

describe("dropping", () => {
  it("hands over a real handle when the browser gives one", async () => {
    const onsource = renderDrop();
    const handle = { kind: "file" };
    await fireEvent.drop(screen.getByRole("group", { name: "Drop it here" }), {
      dataTransfer: transfer({ handle }),
    });
    await waitFor(() => {
      expect(onsource).toHaveBeenCalledWith({ handle, kind: "handle" });
    });
  });

  it("falls back to the file without one", async () => {
    const onsource = renderDrop();
    await fireEvent.drop(screen.getByRole("group", { name: "Drop it here" }), {
      dataTransfer: transfer(),
    });
    await waitFor(() => {
      expect(onsource).toHaveBeenCalledWith({ file: FILE, kind: "file" });
    });
  });

  it("works while it only looks locked", async () => {
    const onsource = renderDrop({ locked: true });
    const box = screen.getByRole("group", { name: "Drop it here" });
    expect(box).toHaveAttribute("aria-disabled", "true");
    expect(box).toHaveAccessibleDescription("Copy the folder first, and this box will wake up.");
    await fireEvent.drop(box, { dataTransfer: transfer() });
    await waitFor(() => {
      expect(onsource).toHaveBeenCalledTimes(1);
    });
  });

  it("says when it couldn't read that file, & lets the player try another", async () => {
    const onsource = vi.fn(() => Promise.reject(new Error("Not a save")));
    renderDrop({}, onsource);
    await fireEvent.drop(screen.getByRole("group", { name: "Drop it here" }), {
      dataTransfer: transfer(),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn’t read that one/);
  });
});

describe("pasting", () => {
  it("counts anywhere outside a text field, & the drop box takes focus", async () => {
    const onsource = renderDrop();
    const handle = { kind: "file" };
    paste(transfer({ handle }));
    await waitFor(() => {
      expect(onsource).toHaveBeenCalledWith({ handle, kind: "handle" });
    });
    expect(screen.getByRole("group", { name: "Drop it here" })).toHaveFocus();
  });

  it("treats a paste that gives only a file like a file chosen in Firefox", async () => {
    const onsource = renderDrop();
    paste(transfer());
    await waitFor(() => {
      expect(onsource).toHaveBeenCalledWith({ file: FILE, kind: "file" });
    });
  });

  it("leaves a text field's paste alone", async () => {
    const onsource = renderDrop();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    expect(paste(transfer(), field)).toBe(true);
    await tick();
    expect(onsource).not.toHaveBeenCalled();
    field.remove();
  });

  it("ignores a paste with no file in it, like the folder path", async () => {
    const onsource = renderDrop();
    expect(paste(transfer({ kind: "string" }))).toBe(true);
    await tick();
    expect(onsource).not.toHaveBeenCalled();
  });

  it("takes a paste once with two drop boxes on the page", async () => {
    const first = renderDrop();
    const second = renderDrop();
    paste(transfer());
    await waitFor(() => {
      expect(first.mock.calls.length + second.mock.calls.length).toBe(1);
    });
  });
});

describe("“Can’t drag?”", () => {
  it.each([
    ["windows", /in File Explorer and press Ctrl\+C/],
    ["linux", /in your file manager and press Ctrl\+C/],
    ["mac", /in Finder and press Command-C/],
  ] as const)("explains pasting on %s where the browser gives handles", async (platform, body) => {
    givesHandles(true);
    renderDrop({ platform });
    await fireEvent.click(screen.getByRole("button", { name: "Can’t drag?" }));
    expect(screen.getByText(body)).toBeVisible();
    expect(screen.queryByText("Choose the save file")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Drop it here" })).toHaveFocus();
    });
  });

  it.each([
    ["windows", /into the File name box/],
    ["linux", /press Ctrl\+L/],
    ["mac", /press Shift-Command-G/],
  ] as const)("offers the picker on %s where it doesn't", async (platform, body) => {
    givesHandles(false);
    const onsource = renderDrop({ platform });
    await fireEvent.click(screen.getByRole("button", { name: "Can’t drag?" }));
    expect(screen.getByText(body)).toBeVisible();
    const input = screen.getByLabelText("Choose the save file");
    await fireEvent.change(input, { target: { files: [FILE] } });
    await waitFor(() => {
      expect(onsource).toHaveBeenCalledWith({ file: FILE, kind: "file" });
    });
  });

  it("no longer mentions a Desktop copy", async () => {
    givesHandles(false);
    renderDrop();
    await fireEvent.click(screen.getByRole("button", { name: "Can’t drag?" }));
    expect(screen.queryByText(/Desktop|copy/i)).toBeNull();
  });
});
