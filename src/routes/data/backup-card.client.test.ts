import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";
import { enableSpoilers } from "#lib/test-utils/spoilers.js";
import { CURRENT_SERIALIZATION_VERSION } from "#lib/types/user-progress.js";

import BackupCard from "./backup-card.svelte";

async function restoreFromFile(file: File) {
  await fireEvent.click(screen.getByRole("button", { name: "Restore from backup" }));
  const input = screen.getByLabelText("Choose a backup file to restore");
  await fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(async () => {
  await userState.startTrackingByHand();
});

describe("BackupCard export", () => {
  it("downloads the serialized state as a dated JSON file", async () => {
    enableSpoilers();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mistria/backup");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockReturnValue(undefined);
    render(BackupCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Export backup" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURL.mock.calls[0];
    if (!(blob instanceof Blob)) throw new Error("Expected the backup download to use a Blob");
    expect(blob.type).toBe("application/json");
    expect(await blob.text()).toBe(userState.exportBackup());

    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^mistria-field-guide-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(anchor.href).toBe("blob:mistria/backup");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mistria/backup");
  });
});

describe("BackupCard restore", () => {
  it("replaces the current state from a valid backup and announces success", async () => {
    userState.setRenown(7);
    const backup = userState.exportBackup();
    userState.resetAll();
    expect(userState.state.progress.renown).toBe(0);
    render(BackupCard, { open: true });

    await restoreFromFile(new File([backup], "backup.json", { type: "application/json" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("All set, your backup is restored!");
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(userState.state.progress.renown).toBe(7);
    expect(screen.getByRole("button", { name: "Restore from backup" })).toBeEnabled();
  });

  it("rejects malformed JSON and leaves the current state untouched", async () => {
    enableSpoilers();
    const before = userState.exportBackup();
    render(BackupCard, { open: true });

    await restoreFromFile(new File(["{not json"], "broken.json", { type: "application/json" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/doesn’t look like a backup file/);
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(userState.exportBackup()).toBe(before);
  });

  it("rejects a backup missing required fields", async () => {
    render(BackupCard, { open: true });

    await restoreFromFile(new File(['{"version":1}'], "partial.json"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/missing some data/);
  });

  it("rejects a backup from a newer version", async () => {
    render(BackupCard, { open: true });

    const future = JSON.stringify({ version: CURRENT_SERIALIZATION_VERSION + 1 });
    await restoreFromFile(new File([future], "future.json"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/future version/);
  });

  it("reports an unreadable file", async () => {
    const file = new File(["{}"], "unreadable.json");
    vi.spyOn(file, "text").mockRejectedValue(new DOMException("read failed", "NotReadableError"));
    render(BackupCard, { open: true });

    await restoreFromFile(file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t open that file, so we left your progress as it was. Make sure you picked a backup you downloaded from here.",
    );
    expect(screen.getByRole("button", { name: "Restore from backup" })).toBeEnabled();
  });

  it("clears a previous error once a later restore succeeds", async () => {
    render(BackupCard, { open: true });
    await restoreFromFile(new File(["{not json"], "broken.json"));
    await screen.findByRole("alert");

    await restoreFromFile(new File([userState.exportBackup()], "backup.json"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("All set, your backup is restored!");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("BackupCard unreadable data", () => {
  it("hides the download action when nothing was quarantined", () => {
    render(BackupCard, { open: true });

    expect(screen.queryByRole("button", { name: "Download unreadable data" })).toBeNull();
  });

  it("downloads stored progress that couldn't be read", async () => {
    const invalid = "{not json";
    localStorage.setItem("mistria-fyi:progress", invalid);
    userState.loadFromStorage();
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mistria/unreadable");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockReturnValue(undefined);
    render(BackupCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Download unreadable data" }));

    const [blob] = createObjectURL.mock.calls[0];
    if (!(blob instanceof Blob)) throw new Error("Expected the unreadable download to use a Blob");
    expect(await blob.text()).toBe(invalid);
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^mistria-field-guide-unreadable-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
