import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import { factsQuestionBody, FIELD_CATEGORIES } from "./sync-question-copy.js";

import type { FactsQuestion } from "#lib/engine/sync-apply.js";
import type { ReceiverOptions, ReceiverStatus } from "#lib/sync/receiver.js";

const enabled = vi.hoisted(() => ({ syncEnabled: true }));
vi.mock("#lib/sync/enabled.js", () => ({
  get syncEnabled() {
    return enabled.syncEnabled;
  },
}));
vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));
const toast = vi.hoisted(() => vi.fn());
vi.mock("svelte-sonner", () => ({ toast }));

/** The receiver under the page's state, so a test can say what it reports. */
const fake = vi.hoisted(() => ({
  start: vi.fn(),
  answer: vi.fn(() => Promise.resolve()),
  options: undefined as ReceiverOptions | undefined,
  refresh: vi.fn(),
  stop: vi.fn(),
  tellsShown: vi.fn(),
  update: vi.fn(),
}));
vi.mock("#lib/sync/receiver.js", () => ({
  createReceiver: (options: ReceiverOptions) => {
    fake.options = options;
    return {
      start: fake.start,
      answer: fake.answer,
      applyLocalSave: vi.fn(),
      refresh: fake.refresh,
      status: { kind: "idle" },
      stop: fake.stop,
      tellsShown: fake.tellsShown,
      update: fake.update,
    };
  },
}));

const PROGRESS_KEY = "mistria-fyi:progress";
const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const FOLLOWING = { key: KEY, kind: "following" };
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 31, 12);

function blob(local: Record<string, unknown>): string {
  return JSON.stringify({
    lastImport: null,
    local,
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

function report(status: ReceiverStatus): void {
  fake.options?.onstatus?.(status);
}

async function loadStore(local: Record<string, unknown>) {
  vi.stubGlobal("localStorage", memoryStorage({ [PROGRESS_KEY]: blob(local) }));
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();
  return userState;
}

async function renderHost() {
  await loadStore({ syncLane: FOLLOWING });
  const { default: Host } = await import("./sync-receiver-host.svelte");
  render(Host);
  await tick();
}

async function renderNote() {
  await loadStore({ syncLane: FOLLOWING });
  const { default: Note } = await import("./sync-trouble-note.svelte");
  render(Note);
  await tick();
}

function question(field: FactsQuestion["field"], reason: FactsQuestion["reason"]): FactsQuestion {
  return { differences: [], field, id: "q", kind: "facts", reason };
}

beforeEach(async () => {
  vi.setSystemTime(NOW);
  enabled.syncEnabled = true;
  pageStub.reset();
  pageStub.navigate("/en");
  fake.answer.mockClear();
  fake.refresh.mockClear();
  fake.start.mockClear();
  fake.update.mockClear();
  // The page's one receiver state outlives each test, so it starts each one quiet.
  const { syncReceiver } = await import("#lib/sync/receiver-state.svelte.js");
  report({ kind: "idle" });
  syncReceiver.reopenQuestion();
});

afterEach(async () => {
  cleanup();
  await tick();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the question dialog", () => {
  const FARM: ReceiverStatus = {
    kind: "asking",
    questions: [{ farmName: "Saved Acres", id: "farm:1", kind: "farm" }],
  };

  it("uses the unnamed copy for a save with no farm name", async () => {
    await renderHost();
    report({ kind: "asking", questions: [{ farmName: null, id: "farm:2", kind: "farm" }] });
    await tick();
    expect(screen.getByText(/We found a farm in this save file/)).toBeVisible();
  });

  it("starts the receiver & tells it each time the lane, store, or receipt changes", async () => {
    const userState = await loadStore({ syncLane: FOLLOWING });
    const { default: Host } = await import("./sync-receiver-host.svelte");
    render(Host);
    await tick();
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.update).toHaveBeenCalledTimes(1);

    await userState.stopSyncing();
    await tick();
    expect(fake.update).toHaveBeenCalledTimes(2);
  });

  it("holds a tell while no tab is showing, then says it once (F6)", async () => {
    await renderHost();
    toast.mockClear();
    fake.tellsShown.mockClear();
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fake.options?.ontell?.({ applied: false, kept: false, switchedFrom: { farmName: "Old" } });
    expect(toast).not.toHaveBeenCalled();

    hidden.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Old"));
    expect(fake.tellsShown).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event("visibilitychange"));
    expect(toast).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
  });

  it("forgets a held tell once another tab has said it (F6)", async () => {
    await renderHost();
    toast.mockClear();
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fake.options?.ontell?.({ applied: true, kept: false });
    fake.options?.ontellsshown?.();
    hidden.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(toast).not.toHaveBeenCalled();
    hidden.mockRestore();
  });

  it("asks a question & sends the answer on", async () => {
    await renderHost();
    report(FARM);
    await tick();
    expect(screen.getByText("Is this the farm you’ve been tracking?")).toBeVisible();
    // The save's farm, whatever the stored progress is called (F5).
    expect(screen.getByText(/This save file is for Saved Acres/)).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Yep, same farm" }));
    expect(fake.answer).toHaveBeenCalledWith("farm:1", "same-farm");
  });

  it("closes on “Not now”, & opens again when the question changes", async () => {
    await renderHost();
    report(FARM);
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => {
      expect(screen.queryByText("Is this the farm you’ve been tracking?")).toBeNull();
    });
    expect(fake.answer).not.toHaveBeenCalled();

    report({
      kind: "asking",
      questions: [{ id: "older", kind: "older-save", lastPlaytime: 9, playtime: 3 }],
    });
    await tick();
    expect(screen.getByText("Go back to an older save file?")).toBeVisible();
  });

  it("says a backup will be replaced, naming it", async () => {
    await renderHost();
    report({
      kind: "asking",
      questions: [
        { farmName: "Old Acres", id: "replace", kind: "replace-backup", savedAt: NOW - DAY },
      ],
    });
    await tick();
    expect(screen.getByText(/replaces your backup of Old Acres/)).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Replace it" }));
    expect(fake.answer).toHaveBeenCalledWith("replace", "accept");
  });
});

describe("the notes", () => {
  it("says nothing while all is well", async () => {
    await renderNote();
    report({ kind: "up-to-date" });
    await tick();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    ["unreadable", "Your computer is having trouble reading your save file"],
    ["update-computer", "The tracker on your computer needs a refresh"],
    ["update-here", "This tracker needs a refresh"],
    ["retired", "Your computer stopped sharing this save file"],
    ["switch-failed", "We didn’t switch farms"],
    ["write-failed", "We couldn’t store your latest save file"],
    ["blocked", "this device’s data needs a look"],
  ] as const)("shows %s", async (kind, text) => {
    await renderNote();
    report({ kind });
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent(text);
  });

  it("tries again on request", async () => {
    await renderNote();
    report({ kind: "write-failed" });
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(fake.refresh).toHaveBeenCalledTimes(1);
  });

  it("offers a cancelled question again", async () => {
    await renderNote();
    const { syncReceiver } = await import("#lib/sync/receiver-state.svelte.js");
    report({ kind: "asking", questions: [{ farmName: null, id: "farm:1", kind: "farm" }] });
    await tick();
    expect(screen.queryByRole("status")).toBeNull();

    syncReceiver.dismissQuestion();
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("has a question for you");
    await fireEvent.click(screen.getByRole("button", { name: "Answer it" }));
    expect(syncReceiver.question?.id).toBe("farm:1");
  });
});

describe("the status panel", () => {
  it("shows the last save file's time & in-game date", async () => {
    await loadStore({
      syncFreshness: {
        gameDate: { day: 14, season: "summer", year: 2 },
        gaps: [],
        modified: NOW - DAY,
      },
      syncLane: FOLLOWING,
    });
    const { default: Panel } = await import("./sync-status-panel.svelte");
    render(Panel);
    await tick();
    expect(screen.getByText("Your gaming computer")).toBeVisible();
    expect(screen.getByText("Last save file")).toBeVisible();
    expect(screen.getByText("In-game date")).toBeVisible();
    expect(screen.getByText(/14, Year 2/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sync & data settings" })).toBeVisible();
  });

  it("offers “Try again” when the relay can't be reached", async () => {
    await loadStore({ syncLane: FOLLOWING });
    const { default: Panel } = await import("./sync-status-panel.svelte");
    render(Panel);
    report({ kind: "unreachable" });
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(fake.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("the gap", () => {
  const stale = { gaps: [DAY], modified: NOW - 5 * DAY };

  it("speaks up only for a follower, after an abnormally long gap", async () => {
    await loadStore({ syncFreshness: stale, syncLane: FOLLOWING });
    const { syncReceiver } = await import("#lib/sync/receiver-state.svelte.js");
    expect(syncReceiver.gapDays).toBe(5);
  });

  it("stays quiet on the computer, which has nothing to wait for", async () => {
    await loadStore({ syncFreshness: stale, syncLane: { kind: "computer" } });
    const { syncReceiver } = await import("#lib/sync/receiver-state.svelte.js");
    expect(syncReceiver.gapDays).toBeUndefined();
  });

  it("stays quiet after a usual gap", async () => {
    await loadStore({ syncFreshness: { gaps: [], modified: NOW - DAY }, syncLane: FOLLOWING });
    const { syncReceiver } = await import("#lib/sync/receiver-state.svelte.js");
    expect(syncReceiver.gapDays).toBeUndefined();
  });

  it("leaves it to the note when something's wrong", async () => {
    await loadStore({ syncFreshness: stale, syncLane: FOLLOWING });
    const { syncReceiver } = await import("#lib/sync/receiver-state.svelte.js");
    report({ kind: "unreadable" });
    expect(syncReceiver.gapDays).toBeUndefined();
    expect(syncReceiver.needsALook).toBe(true);
  });
});

describe("factsQuestionBody", () => {
  it("names the category & why it asks", () => {
    expect(factsQuestionBody(question("questStates", "many-removals"), "en")).toMatch(
      /^Quests: your save file would take back/,
    );
    expect(factsQuestionBody(question("reachedSeason", "level-decrease"), "en")).toBe(
      "Your farm: your save file has lower levels than this device.",
    );
  });

  it("has a category for every field", () => {
    expect(Object.keys(FIELD_CATEGORIES)).toContain("household");
    expect(Object.keys(FIELD_CATEGORIES)).toHaveLength(22);
  });
});
