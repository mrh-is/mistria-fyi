import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { deflateSync } from "node:zlib";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import type { CourierOptions, CourierStatus } from "#lib/sync/courier.js";
import type { RelayClient } from "#lib/sync/follow.js";

const enabled = vi.hoisted(() => ({ syncEnabled: true }));
vi.mock("#lib/sync/enabled.js", () => ({
  get syncEnabled() {
    return enabled.syncEnabled;
  },
}));
vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));
vi.mock("$app/navigation", () => ({ afterNavigate: vi.fn(), goto: vi.fn() }));
// Drawing a code needs a canvas, which the test environment doesn't have.
vi.mock("../../../routes/data/transfer-qr.js", () => ({
  generateTransferQr: () =>
    Promise.resolve({ dataUrl: "data:image/png;base64,AA", displayPixels: 200 }),
}));

/** The courier under the page's state, so a test can say what it reports. */
const fake = vi.hoisted(() => ({
  start: vi.fn(),
  check: vi.fn(() => Promise.resolve()),
  options: undefined as CourierOptions | undefined,
  reallow: vi.fn(() => Promise.resolve()),
  retry: vi.fn(),
  stop: vi.fn(),
  take: vi.fn(() => Promise.resolve()),
  update: vi.fn(),
}));
vi.mock("#lib/sync/courier.js", () => ({
  createCourier: (options: CourierOptions) => {
    fake.options = options;
    return { ...fake, status: undefined };
  },
  IDLE_COURIER: {
    codeRenewed: false,
    fileName: undefined,
    source: "unknown",
    trouble: undefined,
    upload: "idle",
  },
}));

const PROGRESS_KEY = "mistria-fyi:progress";
const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const TOKEN = "__________________________________________8";
const SHARING = { code: { key: KEY, token: TOKEN }, kind: "computer" };

function report(status: Partial<CourierStatus>): void {
  fake.options?.onstatus?.({
    codeRenewed: false,
    fileName: undefined,
    source: "watched",
    trouble: undefined,
    upload: "idle",
    ...status,
  });
}

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
      renown: 0,
      spells: [],
    },
    version: 3,
    worldState: { season: "spring", weather: "calm" },
  });
}

function u64(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function saveFile(): File {
  const encoder = new TextEncoder();
  const entries = {
    gamedata: { date: 0 },
    header: { farm_name: "Rosewood", name: "Pat", playtime: 100 },
  };
  const parts: Uint8Array[] = [u64(Object.keys(entries).length)];
  for (const [name, data] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(JSON.stringify(data));
    parts.push(u64(nameBytes.length), nameBytes, u64(dataBytes.length), dataBytes);
  }
  return new File(
    [Uint8Array.from(deflateSync(Buffer.concat(parts)))],
    "game-1315159680-autosave.sav",
  );
}

/** A file dropped by a browser that gives no handles, as the tests' browser does. */
async function dropSave(file: File, label: RegExp | string): Promise<void> {
  await fireEvent.drop(screen.getByRole("group", { name: label }), {
    dataTransfer: {
      files: [file],
      items: [{ getAsFile: () => file, kind: "file" }],
    },
  });
}

async function loadStore(local: Record<string, unknown>) {
  vi.stubGlobal("localStorage", memoryStorage({ [PROGRESS_KEY]: blob(local) }));
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();
  return userState;
}

async function renderNote(lane: Record<string, unknown> = SHARING) {
  await loadStore({ syncLane: lane });
  const { default: Note } = await import("./sync-trouble-note.svelte");
  render(Note);
  await tick();
}

async function renderCard() {
  await loadStore({ syncLane: SHARING });
  const { default: Card } = await import("../../../routes/data/sync-card.svelte");
  render(Card);
  await tick();
}

async function relayWith(overrides: Partial<RelayClient> = {}) {
  const relay: RelayClient = {
    create: vi.fn<RelayClient["create"]>().mockResolvedValue({ kind: "created" }),
    read: vi.fn<RelayClient["read"]>().mockResolvedValue({ kind: "empty" }),
    retire: vi.fn<RelayClient["retire"]>().mockResolvedValue({ kind: "retired" }),
    upload: vi.fn<RelayClient["upload"]>().mockResolvedValue({ kind: "stored" }),
    ...overrides,
  };
  const sharing = await import("#lib/sync/sharing.js");
  sharing.setRelayClient(relay);
  sharing.setTurnstileTokenSource(() => Promise.resolve("challenge"));
  return relay;
}

async function renderSetup() {
  const userState = await loadStore({});
  const relay = await relayWith();
  const { default: Setup } = await import("../../../routes/sync/computer-setup.svelte");
  render(Setup, { announce: vi.fn(), linkOrigin: "https://mistria.fyi" });
  await tick();
  return { relay, userState };
}

async function renderCodeArea(local: Record<string, unknown>, overrides = {}) {
  await loadStore(local);
  const relay = await relayWith(overrides);
  const { default: CodeArea } = await import("../../../routes/sync/code-area.svelte");
  render(CodeArea, { linkOrigin: "https://mistria.fyi" });
  await tick();
  return relay;
}

beforeEach(async () => {
  enabled.syncEnabled = true;
  pageStub.reset();
  pageStub.navigate("/en/data");
  for (const mock of [fake.check, fake.reallow, fake.retry, fake.start, fake.take, fake.update]) {
    mock.mockClear();
  }
  await import("#lib/sync/courier-state.svelte.js");
  report({});
});

afterEach(async () => {
  cleanup();
  await tick();
  vi.unstubAllGlobals();
});

describe("the notes", () => {
  it("says nothing while all is well", async () => {
    await renderNote();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the full notice for a save it can't read", async () => {
    await renderNote();
    report({ trouble: "unreadable" });
    await tick();
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent("Hmm, we can’t read your save file");
    expect(note).toHaveTextContent("Number one: nothing is lost.");
    expect(note).toHaveTextContent("It can happen when Fields of Mistria releases an update.");
    expect(note).toHaveTextContent("leave this tab open");
  });

  it("asks for access again after a restart", async () => {
    await renderNote();
    report({ trouble: "reallow" });
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent("Your browser asks after a restart.");
    await fireEvent.click(screen.getByRole("button", { name: "Let us read it" }));
    expect(fake.reallow).toHaveBeenCalledTimes(1);
  });

  it("gives lost access the folder, the drop box, & “Can’t drag?” too", async () => {
    await renderNote();
    report({ trouble: "reallow" });
    await tick();
    expect(screen.getByText(/FieldsOfMistria/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Can’t drag?" })).toBeVisible();
    await dropSave(saveFile(), "Drop your autosave here");
    await waitFor(() => {
      expect(fake.take).toHaveBeenCalledTimes(1);
    });
  });

  it("gives a moved file the folder, the drop box, & “Can’t drag?”", async () => {
    await renderNote();
    report({ trouble: "moved" });
    await tick();
    expect(screen.getByText("We lost track of your save file")).toBeVisible();
    expect(screen.getByText(/FieldsOfMistria/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Can’t drag?" })).toBeVisible();

    await dropSave(saveFile(), "Drop your autosave here");
    await waitFor(() => {
      expect(fake.take).toHaveBeenCalledTimes(1);
    });
  });

  it("refuses a dropped file that isn't a save, without touching the courier", async () => {
    await renderNote();
    report({ trouble: "moved" });
    await tick();
    await dropSave(new File(["nope"], "notes.sav"), "Drop your autosave here");
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn’t read that one/);
    expect(fake.take).not.toHaveBeenCalled();
  });

  it.each([
    [{ trouble: "other-window" }, "Your save file is already syncing in another window."],
    [{ upload: "paused" }, "Sync is paused for now"],
    [{ codeRenewed: true }, "We made a new code for your save file."],
  ] as const)("says so for %o", async (status, text) => {
    await renderNote();
    report(status);
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent(text);
  });

  it("offers “Try again” when the relay can't be reached", async () => {
    await renderNote();
    report({ upload: "unreachable" });
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(fake.retry).toHaveBeenCalledTimes(1);
  });

  it("keeps a follower out of it", async () => {
    await renderNote({ key: KEY, kind: "following" });
    report({ trouble: "unreadable" });
    await tick();
    expect(screen.queryByText("Hmm, we can’t read your save file")).toBeNull();
  });
});

describe("Data's sync card", () => {
  it("takes each new save file where it isn't watched", async () => {
    await renderCard();
    report({ source: "file" });
    await tick();
    expect(screen.getByText(/drop your save file in again/)).toBeVisible();
    expect(screen.queryByText(/Keep this tab open/)).toBeNull();
    expect(screen.getByRole("button", { name: "Can’t drag?" })).toBeVisible();

    await dropSave(saveFile(), "Drop in your latest save file");
    await waitFor(() => {
      expect(fake.take).toHaveBeenCalledTimes(1);
    });
    expect(fake.take).toHaveBeenCalledWith(expect.objectContaining({ kind: "file" }));
  });

  it("holds no drop box while the save file's watched", async () => {
    await renderCard();
    report({ fileName: "game-1315159680-autosave.sav", source: "watched" });
    await tick();
    expect(screen.queryByRole("group", { name: "Drop in your latest save file" })).toBeNull();
    expect(screen.getByText(/Keep this tab open/)).toBeVisible();
    expect(screen.getByText("game-1315159680-autosave.sav")).toBeVisible();
  });

  it("holds none before it knows, or while another window has it", async () => {
    await renderCard();
    report({ source: "unknown" });
    await tick();
    expect(screen.queryByRole("group", { name: "Drop in your latest save file" })).toBeNull();
    report({ source: "unknown", trouble: "other-window" });
    await tick();
    expect(screen.queryByRole("group", { name: "Drop in your latest save file" })).toBeNull();
  });

  it("checks the save when the code is shown again", async () => {
    await renderCard();
    await fireEvent.click(screen.getByRole("button", { name: "Show code" }));
    await waitFor(() => {
      expect(fake.check).toHaveBeenCalledTimes(1);
    });
  });
});

describe("the status panel", () => {
  it("links to the drop box where the save file isn't watched", async () => {
    await loadStore({ syncLane: SHARING });
    const { default: Panel } = await import("./sync-status-panel.svelte");
    render(Panel);
    report({ source: "file" });
    await tick();
    expect(screen.getByRole("link", { name: "Drop in your latest save file" })).toBeVisible();
    expect(screen.queryByText(/Keep this tab open/)).toBeNull();
  });
});

describe("sharing", () => {
  it("makes a code at the first “Show code”, & shows it only once that works", async () => {
    const created = Promise.withResolvers<{ kind: "created" }>();
    const relay = await renderCodeArea(
      { syncLane: { kind: "computer" } },
      {
        create: vi.fn(() => created.promise),
      },
    );
    await fireEvent.click(screen.getByRole("button", { name: "Show code" }));
    await waitFor(() => {
      expect(relay.create).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Generating the code…")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
    expect(fake.check).not.toHaveBeenCalled();

    created.resolve({ kind: "created" });
    await waitFor(() => {
      expect(screen.getByRole("img")).toBeVisible();
    });
    expect(fake.check).toHaveBeenCalledTimes(1);
  });

  it("keeps the code hidden when the mailbox can't be made", async () => {
    await renderCodeArea(
      { syncLane: { kind: "computer" } },
      { create: vi.fn().mockResolvedValue({ kind: "unreachable" }) },
    );
    await fireEvent.click(screen.getByRole("button", { name: "Show code" }));
    await waitFor(() => {
      expect(screen.getByText("We can’t connect right now")).toBeVisible();
    });
    expect(screen.queryByRole("img")).toBeNull();
    expect(fake.check).not.toHaveBeenCalled();
  });

  it("makes a code at the first “Copy link” too", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const relay = await renderCodeArea({ syncLane: { kind: "computer" } });
    await fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => {
      expect(relay.create).toHaveBeenCalledTimes(1);
    });
  });
});

describe("computer setup", () => {
  it("creates nothing for “No thanks”, & hands the save file to the courier", async () => {
    const { relay, userState } = await renderSetup();
    await dropSave(saveFile(), "Drop your autosave here");
    await fireEvent.click(await screen.findByRole("button", { name: "Yep!" }));
    await waitFor(() => {
      expect(fake.take).toHaveBeenCalledTimes(1);
    });
    expect(userState.syncLane).toEqual({ kind: "computer" });

    await fireEvent.click(
      await screen.findByRole("button", { name: "No thanks, I’ll track here" }),
    );
    expect(relay.create).not.toHaveBeenCalled();
    expect(screen.getByText(/drop your save file in again/)).toBeVisible();
  });

  it("creates nothing, & starts nothing, for a wrong file", async () => {
    const { relay, userState } = await renderSetup();
    await dropSave(saveFile(), "Drop your autosave here");
    await fireEvent.click(await screen.findByRole("button", { name: "Hmm, no, try that again" }));
    expect(fake.take).not.toHaveBeenCalled();
    expect(relay.create).not.toHaveBeenCalled();
    expect(userState.syncLane).toBeUndefined();
  });

  it("promises watching only for a save file with a handle", async () => {
    await renderSetup();
    const handle = { getFile: () => Promise.resolve(saveFile()), kind: "file" };
    await fireEvent.drop(screen.getByRole("group", { name: "Drop your autosave here" }), {
      dataTransfer: {
        files: [saveFile()],
        items: [
          {
            getAsFile: saveFile,
            getAsFileSystemHandle: () => Promise.resolve(handle),
            kind: "file",
          },
        ],
      },
    });
    await fireEvent.click(await screen.findByRole("button", { name: "Yep!" }));
    await fireEvent.click(
      await screen.findByRole("button", { name: "No thanks, I’ll track here" }),
    );
    expect(screen.getByText(/we’ll sync your save file every time you sleep/)).toBeVisible();
  });
});

describe("the done screen", () => {
  it("doesn't ask for the file again while another window may be watching it", async () => {
    await loadStore({ syncLane: { kind: "computer" } });
    await relayWith();
    const { default: Setup } = await import("../../../routes/sync/computer-setup.svelte");
    render(Setup, { announce: vi.fn(), linkOrigin: "https://mistria.fyi" });
    report({ source: "unknown", trouble: "other-window" });
    await tick();
    await fireEvent.click(
      await screen.findByRole("button", { name: "No thanks, I’ll track here" }),
    );
    expect(screen.getByText(/we’ll sync your save file every time you sleep/)).toBeVisible();
  });
});

describe("the sync switch", () => {
  it("keeps the Data page's card, & so its drop box, off the production site", async () => {
    enabled.syncEnabled = false;
    await loadStore({ syncLane: SHARING });
    report({ source: "file" });
    const { default: DataPage } = await import("../../../routes/data/+page.svelte");
    render(DataPage);
    await tick();
    expect(screen.queryByRole("group", { name: "Drop in your latest save file" })).toBeNull();
    expect(screen.queryByText(/Save file sync/)).toBeNull();
  });
});
