import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

import BackupCard from "./backup-card.svelte";

async function restoreFromFile(file: File) {
  await fireEvent.click(screen.getByRole("button", { name: "Restore from backup" }));
  const input = screen.getByLabelText("Choose a backup file to restore");
  await fireEvent.change(input, { target: { files: [file] } });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  userState.resetAll();
});

describe("BackupCard export", () => {
  it("downloads the serialized state as a dated JSON file", async () => {
    userState.toggleShowSpoilers();
    const createObjectURL = vi.fn((_blob: Blob) => "blob:mistria/backup");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockReturnValue(undefined);
    render(BackupCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Export backup" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURL.mock.calls[0];
    expect(blob.type).toBe("application/json");
    expect(await blob.text()).toBe(userState.exportState());

    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^mistria-field-guide-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(anchor.href).toBe("blob:mistria/backup");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mistria/backup");
    vi.unstubAllGlobals();
  });
});

describe("BackupCard restore", () => {
  it("replaces the current state from a valid backup and announces success", async () => {
    userState.toggleShowSpoilers();
    const backup = userState.exportState();
    userState.resetAll();
    expect(userState.state.showSpoilers).toBe(false);
    render(BackupCard, { open: true });

    await restoreFromFile(new File([backup], "backup.json", { type: "application/json" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backup restored successfully.");
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(userState.state.showSpoilers).toBe(true);
    expect(screen.getByRole("button", { name: "Restore from backup" })).toBeEnabled();
  });

  it("rejects malformed JSON and leaves the current state untouched", async () => {
    userState.toggleShowSpoilers();
    const before = userState.exportState();
    render(BackupCard, { open: true });

    await restoreFromFile(new File(["{not json"], "broken.json", { type: "application/json" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/This file is not valid JSON/);
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(userState.exportState()).toBe(before);
  });

  it("rejects a backup missing required fields", async () => {
    render(BackupCard, { open: true });

    await restoreFromFile(new File(['{"version":"1"}'], "partial.json"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/missing required data/);
  });

  it("rejects a backup from a newer version", async () => {
    render(BackupCard, { open: true });

    await restoreFromFile(new File(['{"version":"3"}'], "future.json"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/newer version/);
  });

  it("reports an unreadable file", async () => {
    const file = new File(["{}"], "unreadable.json");
    vi.spyOn(file, "text").mockRejectedValue(new DOMException("read failed", "NotReadableError"));
    render(BackupCard, { open: true });

    await restoreFromFile(file);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read this backup file.");
    expect(screen.getByRole("button", { name: "Restore from backup" })).toBeEnabled();
  });

  it("clears a previous error once a later restore succeeds", async () => {
    render(BackupCard, { open: true });
    await restoreFromFile(new File(["{not json"], "broken.json"));
    await screen.findByRole("alert");

    await restoreFromFile(new File([userState.exportState()], "backup.json"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Backup restored successfully.");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
