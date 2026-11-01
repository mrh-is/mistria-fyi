import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

const enabled = vi.hoisted(() => ({ syncEnabled: true }));
vi.mock("#lib/sync/enabled.js", () => ({
  get syncEnabled() {
    return enabled.syncEnabled;
  },
}));
vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));
vi.mock("$app/navigation", () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock("#lib/sync/device.js", () => ({
  currentDevice: () => ({ browserName: "Firefox", computer: true, iosBrowser: false, mac: false }),
}));

const TITLE = "Let Chrome do this for you";

async function renderPage() {
  const { default: Page } = await import("./+page.svelte");
  render(Page);
  await tick();
  await screen.findByRole("heading", { name: "Where’s your save file?" });
}

async function startComputer() {
  await renderPage();
  await fireEvent.click(screen.getByRole("button", { name: /My save file is on this computer/ }));
  await tick();
}

beforeEach(async () => {
  enabled.syncEnabled = true;
  pageStub.reset();
  pageStub.navigate("/en/sync?from=setup");
  vi.stubGlobal("DataTransferItem", { prototype: {} });
  vi.stubGlobal("localStorage", memoryStorage());
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();
});

afterEach(async () => {
  cleanup();
  await tick();
  vi.unstubAllGlobals();
});

describe("the Chrome tip", () => {
  it("opens over the first computer step in a browser without drop handles", async () => {
    await startComputer();
    const dialog = await screen.findByRole("dialog", { name: TITLE });
    expect(dialog).toHaveTextContent(
      "In Chrome or Edge, we can sync your save file every time you sleep, no dropping it in again.",
    );
    expect(dialog).toHaveTextContent("Copy this page’s link, then paste it into Chrome or Edge.");
    expect(within(dialog).getByRole("button", { name: "Copy this page’s link" })).toBeVisible();

    await fireEvent.click(
      within(dialog).getByRole("button", { name: "I’ll stick with this browser" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(screen.getByRole("heading", { name: "Find your save file" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Drop your autosave here" })).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Can’t drag?" }));
    expect(screen.getByLabelText("Choose the save file")).toBeInTheDocument();
  });

  it("copies the current page’s complete link", async () => {
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await startComputer();
    await fireEvent.click(await screen.findByRole("button", { name: "Copy this page’s link" }));
    await waitFor(() => {
      expect(write).toHaveBeenCalledWith("https://mistria.fyi/en/sync?from=setup");
    });
  });

  it("keeps the tip usable if clipboard access is refused", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Denied"));
    await startComputer();
    await fireEvent.click(await screen.findByRole("button", { name: "Copy this page’s link" }));
    expect(screen.getByRole("dialog", { name: TITLE })).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "I’ll stick with this browser" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("doesn’t open where Chrome or Edge supply drop handles", async () => {
    vi.stubGlobal("DataTransferItem", { prototype: { getAsFileSystemHandle: vi.fn() } });
    await startComputer();
    expect(screen.getByRole("heading", { name: "Find your save file" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull();
  });

  it("doesn’t open for setup on another device", async () => {
    await renderPage();
    expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull();
    await fireEvent.click(
      screen.getByRole("button", { name: /My save file is on another device/ }),
    );
    expect(screen.queryByRole("heading", { name: "Find your save file" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull();
  });

  it("doesn’t render the added surface with sync switched off", async () => {
    enabled.syncEnabled = false;
    await startComputer();
    expect(screen.getByRole("heading", { name: "Find your save file" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy this page’s link" })).toBeNull();
  });
});
