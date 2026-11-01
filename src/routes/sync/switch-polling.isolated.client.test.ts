import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import type * as SharingModule from "#lib/sync/sharing.js";

const mocks = vi.hoisted(() => ({
  goto: vi.fn(),
  replaceState: vi.fn(),
  retryPendingRetires: vi.fn(),
  switchCode: vi.fn(),
}));
vi.mock("#lib/sync/sharing.js", async (importOriginal) => {
  const sharing = await importOriginal<typeof SharingModule>();
  return {
    ...sharing,
    retryPendingRetires: mocks.retryPendingRetires,
    switchCode: mocks.switchCode,
  };
});
vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));
vi.mock("$app/navigation", () => ({
  afterNavigate: vi.fn(),
  goto: mocks.goto,
  replaceState: mocks.replaceState,
}));

const PROGRESS_KEY = "mistria-fyi:progress";
const CURRENT_KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const SWITCH_KEY = "BBECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

function document_(): string {
  return JSON.stringify({
    lastImport: null,
    local: { syncLane: { key: CURRENT_KEY, kind: "following" } },
    progress: {
      almanac: [],
      animalCosmetics: {},
      animals: {},
      cosmetics: [],
      mineFloor: 0,
      museum: [],
      renown: 3,
      spells: [],
    },
    version: 3,
    worldState: { season: "spring", weather: "calm" },
  });
}

beforeEach(() => {
  pageStub.reset();
  pageStub.navigate(`/en/sync#${SWITCH_KEY}`);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  mocks.goto.mockReset();
  mocks.replaceState.mockReset();
  mocks.retryPendingRetires.mockReset();
  mocks.switchCode.mockReset();
  mocks.retryPendingRetires.mockResolvedValue(undefined);
});

afterEach(async () => {
  cleanup();
  await tick();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("switching to a code without a save", () => {
  it("retries the same code until a save applies without changing the current lane", async () => {
    mocks.switchCode
      .mockResolvedValueOnce({ kind: "empty" })
      .mockResolvedValueOnce({ kind: "applied", save: { modified: 1_700_000_000_000 } });
    vi.stubGlobal("localStorage", memoryStorage({ [PROGRESS_KEY]: document_() }));

    const [{ userState }, { default: SyncPage }, messages] = await Promise.all([
      import("#lib/stores/user-state.svelte.js"),
      import("./+page.svelte"),
      import("#lib/paraglide/messages.js"),
    ]);
    userState.loadFromStorage();
    render(SyncPage);
    await tick();
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: messages.sync_switch_confirm() }));
    await tick();

    expect(
      await screen.findByRole("heading", { name: messages.sync_waiting_title() }),
    ).toBeVisible();
    expect(userState.syncLane).toEqual({ key: CURRENT_KEY, kind: "following" });
    expect(userState.state.progress.renown).toBe(3);
    expect(mocks.switchCode).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await tick();

    expect(mocks.switchCode).toHaveBeenCalledTimes(2);
    expect(mocks.switchCode.mock.calls).toEqual([
      [SWITCH_KEY, expect.any(Function)],
      [SWITCH_KEY, expect.any(Function)],
    ]);
    expect(mocks.goto).toHaveBeenCalledWith("/en");
  });
});
