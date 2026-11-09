import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as m from "#lib/paraglide/messages.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));
vi.mock("$app/navigation", () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock("#lib/sync/device.js", () => ({
  currentDevice: () => ({ browserName: "Firefox", computer: true, iosBrowser: false, mac: false }),
}));

const TITLE = m.sync_tip_chrome();

async function renderPage() {
  const { default: Page } = await import("./+page.svelte");
  render(Page);
  await tick();
  await screen.findByRole("heading", { name: m.sync_where_title() });
}

async function startComputer() {
  await renderPage();
  await fireEvent.click(
    screen.getByRole("button", { name: (name) => name.startsWith(m.sync_where_here()) }),
  );
  await tick();
}

beforeEach(async () => {
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
    expect(dialog).toHaveTextContent(m.sync_tip_chrome_body());
    expect(dialog).toHaveTextContent(m.sync_tip_chrome_after());
    expect(within(dialog).getByRole("button", { name: m.sync_tip_chrome_copy() })).toBeVisible();

    await fireEvent.click(
      within(dialog).getByRole("button", { name: m.sync_tip_chrome_dismiss() }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(screen.getByRole("heading", { name: m.sync_find_title() })).toBeVisible();
    expect(screen.getByRole("group", { name: m.sync_find_drop_next() })).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: m.sync_find_cant_drag() }));
    expect(screen.getByLabelText(m.sync_find_choose())).toBeInTheDocument();
  });

  it("copies the current page’s complete link", async () => {
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await startComputer();
    await fireEvent.click(await screen.findByRole("button", { name: m.sync_tip_chrome_copy() }));
    await waitFor(() => {
      expect(write).toHaveBeenCalledWith("https://mistria.fyi/en/sync?from=setup");
    });
  });

  it("keeps the tip usable if clipboard access is refused", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Denied"));
    await startComputer();
    await fireEvent.click(await screen.findByRole("button", { name: m.sync_tip_chrome_copy() }));
    expect(screen.getByRole("dialog", { name: TITLE })).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: m.sync_tip_chrome_dismiss() }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("doesn’t open where Chrome or Edge supply drop handles", async () => {
    vi.stubGlobal("DataTransferItem", { prototype: { getAsFileSystemHandle: vi.fn() } });
    await startComputer();
    expect(screen.getByRole("heading", { name: m.sync_find_title() })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull();
  });

  it("doesn’t open for setup on another device", async () => {
    await renderPage();
    expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull();
    await fireEvent.click(
      screen.getByRole("button", { name: (name) => name.startsWith(m.sync_where_other()) }),
    );
    expect(screen.queryByRole("heading", { name: m.sync_find_title() })).toBeNull();
    expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull();
  });
});
