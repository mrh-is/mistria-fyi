import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as m from "#lib/paraglide/messages.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { buildSavFile } from "#lib/test-utils/sav.js";

import type { CourierOptions, CourierStatus } from "#lib/sync/courier.js";
import type { RelayClient, RetireResult } from "#lib/sync/follow.js";

vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));
vi.mock("$app/navigation", () => ({ afterNavigate: vi.fn(), goto: vi.fn() }));
// Drawing a code needs a canvas, which the test environment doesn't have.
vi.mock("../../../routes/sync/qr.js", () => ({
  generateFollowQr: () =>
    Promise.resolve({ dataUrl: "data:image/png;base64,AA", displayPixels: 200 }),
}));

/** The courier under the page's state, so a test can say what it reports. */
const fake = vi.hoisted(() => ({
  start: vi.fn(),
  check: vi.fn(() => Promise.resolve()),
  options: undefined as CourierOptions | undefined,
  reallow: vi.fn(() => Promise.resolve()),
  resume: vi.fn(),
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

function saveFile(): File {
  const entries = {
    gamedata: { date: 0 },
    header: { farm_name: "Rosewood", name: "Pat", playtime: 100 },
  };
  return buildSavFile(entries);
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

async function renderCard(local: Record<string, unknown> = {}, relay: Partial<RelayClient> = {}) {
  const userState = await loadStore({ syncLane: SHARING, ...local });
  await relayWith(relay);
  const { default: Card } = await import("../../../routes/data/sync-card.svelte");
  render(Card);
  await tick();
  return userState;
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
  pageStub.reset();
  pageStub.navigate("/en/data");
  for (const mock of [
    fake.check,
    fake.reallow,
    fake.resume,
    fake.retry,
    fake.start,
    fake.take,
    fake.update,
  ]) {
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
    expect(note).toHaveTextContent(m.sync_unreadable_title());
    expect(note).toHaveTextContent(m.sync_unreadable_safe());
    expect(note).toHaveTextContent(m.sync_unreadable_why({ game: m.sync_unreadable_game() }));
    expect(note).toHaveTextContent(m.sync_unreadable_for_now());
  });

  it("asks for access again after a restart", async () => {
    await renderNote();
    report({ trouble: "reallow" });
    await tick();
    expect(screen.getByRole("status")).toHaveTextContent(m.sync_reallow_body());
    await fireEvent.click(screen.getByRole("button", { name: m.sync_reallow_action() }));
    expect(fake.reallow).toHaveBeenCalledTimes(1);
  });

  it("gives lost access the folder, the drop box, & “Can’t drag?” too", async () => {
    await renderNote();
    report({ trouble: "reallow" });
    await tick();
    expect(screen.getByText(/FieldsOfMistria/)).toBeVisible();
    expect(screen.getByRole("button", { name: m.sync_find_cant_drag() })).toBeVisible();
    await dropSave(saveFile(), m.sync_find_drop());
    await waitFor(() => {
      expect(fake.take).toHaveBeenCalledTimes(1);
    });
  });

  it("gives a moved file the folder, the drop box, & “Can’t drag?”", async () => {
    await renderNote();
    report({ trouble: "moved" });
    await tick();
    expect(screen.getByText(m.sync_moved_title())).toBeVisible();
    expect(screen.getByText(/FieldsOfMistria/)).toBeVisible();
    expect(screen.getByRole("button", { name: m.sync_find_cant_drag() })).toBeVisible();

    await dropSave(saveFile(), m.sync_find_drop());
    await waitFor(() => {
      expect(fake.take).toHaveBeenCalledTimes(1);
    });
  });

  it("refuses a dropped file that isn't a save, without touching the courier", async () => {
    await renderNote();
    report({ trouble: "moved" });
    await tick();
    await dropSave(new File(["nope"], "notes.sav"), m.sync_find_drop());
    expect(await screen.findByRole("alert")).toHaveTextContent(m.sync_find_bad_file());
    expect(fake.take).not.toHaveBeenCalled();
  });

  it.each([
    [{ trouble: "other-window" }, m.sync_other_window()],
    [{ upload: "paused" }, m.sync_paused_title()],
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
    await fireEvent.click(screen.getByRole("button", { name: m.sync_try_again() }));
    expect(fake.retry).toHaveBeenCalledTimes(1);
  });

  it("says the relay said no, not that it couldn't connect, & offers “Try again”", async () => {
    await renderNote();
    report({ upload: "refused" });
    await tick();
    expect(screen.getByText(m.sync_refused_title())).toBeVisible();
    expect(screen.queryByText(m.sync_unreachable_title())).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: m.sync_try_again() }));
    expect(fake.retry).toHaveBeenCalledTimes(1);
  });

  it("leaves coming back online to the courier's resume, & “Try again” to its retry", async () => {
    const { syncCourier } = await import("#lib/sync/courier-state.svelte.js");
    const stop = syncCourier.start();
    globalThis.dispatchEvent(new Event("online"));
    expect(fake.resume).toHaveBeenCalledTimes(1);
    expect(fake.retry).not.toHaveBeenCalled();
    stop();
  });

  it("asks for a refresh when the relay speaks another protocol version", async () => {
    await renderNote();
    report({ upload: "update" });
    await tick();
    expect(screen.getByText(/The field guide on this device needs a refresh/u)).toBeVisible();
    expect(screen.getByRole("button", { name: m.sync_update_refresh() })).toBeVisible();
    expect(screen.queryByText(m.sync_unreachable_title())).toBeNull();
  });

  it.each(["refused", "update"] as const)(
    "asks for a look in the toolbar when an upload is %s",
    async (upload) => {
      await loadStore({ syncLane: SHARING });
      const [{ default: Harness }, { FeedbackContext }] = await Promise.all([
        import("#lib/components/toolbar-footer.test-harness.svelte"),
        import("#lib/feedback/context.svelte.js"),
      ]);
      render(Harness, {
        feedbackContext: new FeedbackContext(),
        metadata: { description: "Test page.", title: "Test", toolbar: {} },
      });
      report({ upload });
      await tick();
      expect(screen.getByRole("button", { name: /^Save file sync:/ })).toHaveAccessibleName(
        "Save file sync: needs a look",
      );
    },
  );

  it("keeps a follower out of it", async () => {
    await renderNote({ key: KEY, kind: "following" });
    report({ trouble: "unreadable" });
    await tick();
    expect(screen.queryByText(m.sync_unreadable_title())).toBeNull();
  });
});

describe("Data's sync card", () => {
  it("shows a stored retire as under way until the relay confirms, then announces it", async () => {
    const retire = { mailboxId: "AAAAAAAAAAAAAAAAAAAAAA", token: TOKEN };
    const answer = Promise.withResolvers<RetireResult>();
    const userState = await renderCard(
      { syncPendingRetires: [retire] },
      { retire: () => answer.promise },
    );
    expect(screen.getByText(m.sync_old_code_turning_off())).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(m.sync_old_code_still_works());

    await userState.confirmRetired([retire]);
    await tick();
    expect(screen.queryByText(m.sync_old_code_turning_off())).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(m.sync_old_code_off());
  });

  it("opens to show an old code that outlasted its lane", async () => {
    const retire = { mailboxId: "AAAAAAAAAAAAAAAAAAAAAA", token: TOKEN };
    const answer = Promise.withResolvers<RetireResult>();
    await renderCard(
      { syncLane: undefined, syncPendingRetires: [retire] },
      { retire: () => answer.promise },
    );
    expect(screen.getByText(m.sync_old_code_turning_off())).toBeVisible();
  });

  it("stops showing progress once the relay refuses, & says it'll try again", async () => {
    // The tests above leave their own mailbox's request open, so this one needs another mailbox.
    const retire = { mailboxId: "BBBBBBBBBBBBBBBBBBBBBB", token: TOKEN };
    await renderCard(
      { syncPendingRetires: [retire] },
      { retire: vi.fn<RelayClient["retire"]>().mockResolvedValue({ kind: "refused" }) },
    );
    await waitFor(() => {
      expect(screen.getByText(/We couldn’t turn off your old code yet/u)).toBeVisible();
    });
    expect(screen.queryByText(m.sync_old_code_turning_off())).toBeNull();
  });

  it("says nothing about an old code when none is waiting", async () => {
    await renderCard();
    expect(screen.queryByText(m.sync_old_code_turning_off())).toBeNull();
  });

  it("takes each new save file where it isn't watched", async () => {
    await renderCard();
    report({ source: "file" });
    await tick();
    expect(screen.getByText(/drop your save file in again/)).toBeVisible();
    expect(screen.queryByText(/Keep this tab open/)).toBeNull();
    expect(screen.getByRole("button", { name: m.sync_find_cant_drag() })).toBeVisible();

    await dropSave(saveFile(), m.sync_redrop_label());
    await waitFor(() => {
      expect(fake.take).toHaveBeenCalledTimes(1);
    });
    expect(fake.take).toHaveBeenCalledWith(expect.objectContaining({ kind: "file" }));
  });

  it("holds no drop box while the save file's watched", async () => {
    await renderCard();
    report({ fileName: "game-1315159680-autosave.sav", source: "watched" });
    await tick();
    expect(screen.queryByRole("group", { name: m.sync_redrop_label() })).toBeNull();
    expect(screen.getByText(/Keep this tab open/)).toBeVisible();
    expect(screen.getByText("game-1315159680-autosave.sav")).toBeVisible();
  });

  it("holds none before it knows, or while another window has it", async () => {
    await renderCard();
    report({ source: "unknown" });
    await tick();
    expect(screen.queryByRole("group", { name: m.sync_redrop_label() })).toBeNull();
    report({ source: "unknown", trouble: "other-window" });
    await tick();
    expect(screen.queryByRole("group", { name: m.sync_redrop_label() })).toBeNull();
  });

  it("checks the save when the code is shown again", async () => {
    await renderCard();
    await fireEvent.click(screen.getByRole("button", { name: m.sync_phone_show() }));
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
    expect(screen.getByRole("link", { name: m.sync_redrop_label() })).toBeVisible();
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
    await fireEvent.click(screen.getByRole("button", { name: m.sync_phone_show() }));
    await waitFor(() => {
      expect(relay.create).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(m.sync_making_code())).toBeVisible();
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
    await fireEvent.click(screen.getByRole("button", { name: m.sync_phone_show() }));
    await waitFor(() => {
      expect(screen.getByText(m.sync_unreachable_title())).toBeVisible();
    });
    expect(screen.queryByRole("img")).toBeNull();
    expect(fake.check).not.toHaveBeenCalled();
  });

  it("says the relay turned the code down, & offers “Try again”", async () => {
    await renderCodeArea(
      { syncLane: { kind: "computer" } },
      { create: vi.fn().mockResolvedValue({ kind: "refused" }) },
    );
    await fireEvent.click(screen.getByRole("button", { name: m.sync_phone_show() }));
    await waitFor(() => {
      expect(screen.getByText(m.sync_refused_title())).toBeVisible();
    });
    expect(screen.queryByText(m.sync_unreachable_title())).toBeNull();
    expect(screen.getByRole("button", { name: m.sync_try_again() })).toBeVisible();
  });

  it("makes a code at the first “Copy link” too", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const relay = await renderCodeArea({ syncLane: { kind: "computer" } });
    await fireEvent.click(screen.getByRole("button", { name: m.sync_phone_copy_link() }));
    await waitFor(() => {
      expect(relay.create).toHaveBeenCalledTimes(1);
    });
  });
});

describe("computer setup", () => {
  it("creates nothing for “No thanks”, & hands the save file to the courier", async () => {
    const { relay, userState } = await renderSetup();
    await dropSave(saveFile(), m.sync_find_drop_next());
    await fireEvent.click(await screen.findByRole("button", { name: m.sync_farm_yes() }));
    await waitFor(() => {
      expect(fake.take).toHaveBeenCalledTimes(1);
    });
    expect(userState.syncLane).toEqual({ kind: "computer" });

    await fireEvent.click(await screen.findByRole("button", { name: m.sync_phone_no() }));
    expect(relay.create).not.toHaveBeenCalled();
    expect(screen.getByText(/drop your save file in again/)).toBeVisible();
  });

  it("creates nothing, & starts nothing, for a wrong file", async () => {
    const { relay, userState } = await renderSetup();
    await dropSave(saveFile(), m.sync_find_drop_next());
    await fireEvent.click(await screen.findByRole("button", { name: m.sync_farm_no() }));
    expect(fake.take).not.toHaveBeenCalled();
    expect(relay.create).not.toHaveBeenCalled();
    expect(userState.syncLane).toBeUndefined();
  });

  it("promises watching only for a save file with a handle", async () => {
    await renderSetup();
    const handle = { getFile: () => Promise.resolve(saveFile()), kind: "file" };
    await fireEvent.drop(screen.getByRole("group", { name: m.sync_find_drop_next() }), {
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
    await fireEvent.click(await screen.findByRole("button", { name: m.sync_farm_yes() }));
    await fireEvent.click(await screen.findByRole("button", { name: m.sync_phone_no() }));
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
    await fireEvent.click(await screen.findByRole("button", { name: m.sync_phone_no() }));
    expect(screen.getByText(/we’ll sync your save file every time you sleep/)).toBeVisible();
  });
});
