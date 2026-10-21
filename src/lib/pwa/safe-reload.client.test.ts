import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSafeReload,
  hasOpenDialog,
  isEditing,
  SAFE_RELOAD_POLL_MS,
  UNREACHABLE_RETRY_MS,
} from "./safe-reload.js";
import { holdUpdatesWhile, UpdateHolds } from "./update-holds.js";

import type { SafeReload } from "./safe-reload.js";

let holds: UpdateHolds;
let reload: ReturnType<typeof vi.fn<() => void>>;
let isReachable: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let events: EventTarget;
let scheduler: SafeReload;

beforeEach(() => {
  vi.useFakeTimers();
  holds = new UpdateHolds();
  reload = vi.fn();
  isReachable = vi.fn(() => Promise.resolve(true));
  events = new EventTarget();
  scheduler = createSafeReload({ events, holds, isReachable, now: Date.now, reload });
});

afterEach(() => {
  scheduler.stop();
  document.body.replaceChildren();
  vi.useRealTimers();
});

function append(html: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = html;
  const element = template.content.firstElementChild as HTMLElement;
  document.body.append(element);
  return element;
}

/** Lets timers & the reachability probe settle. */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("busy detection", () => {
  it.each([
    ['<input type="text">', true],
    ["<input>", true],
    ['<input type="search">', true],
    ['<input type="number">', true],
    ["<textarea></textarea>", true],
    ["<select><option>a</option></select>", true],
    ['<input type="checkbox">', false],
    ["<button>Go</button>", false],
  ])("treats focus on %s as editing: %s", (html, editing) => {
    expect(isEditing(append(html))).toBe(editing);
  });

  it("finds open dialogs & panels, but not hidden or closed ones", () => {
    expect(hasOpenDialog(document)).toBe(false);
    const closed = append('<div role="dialog" data-state="closed"></div>');
    append('<div hidden><div role="dialog"></div></div>');
    append("<dialog></dialog>");
    expect(hasOpenDialog(document)).toBe(false);
    closed.dataset.state = "open";
    expect(hasOpenDialog(document)).toBe(true);
    closed.remove();
    append('<div role="alertdialog"></div>');
    expect(hasOpenDialog(document)).toBe(true);
  });

  // A modal marks the rest of the page inert & aria-hidden; a dialog under it is still open.
  it("counts a dialog under another modal as open", () => {
    append('<div inert aria-hidden="true"><div role="dialog"></div></div>');
    expect(hasOpenDialog(document)).toBe(true);
  });
});

describe("createSafeReload", () => {
  it("never reloads or probes without an update", async () => {
    await advance(SAFE_RELOAD_POLL_MS * 10);
    document.dispatchEvent(new Event("visibilitychange"));
    events.dispatchEvent(new Event("online"));
    await advance(0);
    expect(reload).not.toHaveBeenCalled();
    expect(isReachable).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(false);
    scheduler.navigationCompleted();
    await advance(0);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads at once when the page isn't busy, and only once", async () => {
    scheduler.request();
    scheduler.request();
    await advance(SAFE_RELOAD_POLL_MS * 5);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits out a held task and reloads once it's released", async () => {
    const release = holds.hold();
    scheduler.request();
    await advance(SAFE_RELOAD_POLL_MS * 5);
    expect(reload).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(true);

    release();
    await advance(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits until every overlapping hold is released", async () => {
    const first = holds.hold();
    const second = holds.hold();
    scheduler.request();
    first();
    first();
    await advance(SAFE_RELOAD_POLL_MS);
    expect(reload).not.toHaveBeenCalled();
    second();
    await advance(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits out an open dialog and reloads once it closes", async () => {
    const dialog = append('<div role="dialog" aria-modal="true"></div>');
    scheduler.request();
    await advance(SAFE_RELOAD_POLL_MS * 3);
    expect(reload).not.toHaveBeenCalled();

    dialog.remove();
    await advance(SAFE_RELOAD_POLL_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits while a field has focus and reloads once focus leaves it", async () => {
    const field = append("<textarea></textarea>");
    field.focus();
    scheduler.request();
    await advance(SAFE_RELOAD_POLL_MS * 3);
    expect(reload).not.toHaveBeenCalled();

    field.blur();
    await advance(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // Reloading onto a 5xx mid-deploy, or offline onto a page no cache holds, would swap a working
  // page for an error. The page stays until the reload would load it.
  it("keeps an unreachable page as it is and retries after a pause", async () => {
    isReachable.mockResolvedValue(false);
    scheduler.request();
    await advance(SAFE_RELOAD_POLL_MS * 5);
    expect(reload).not.toHaveBeenCalled();
    // Polls don't hammer the server: one probe until the pause is over.
    expect(isReachable).toHaveBeenCalledTimes(1);

    isReachable.mockResolvedValue(true);
    await advance(UNREACHABLE_RETRY_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("probes again at once when the browser comes back online", async () => {
    isReachable.mockResolvedValue(false);
    scheduler.request();
    await advance(0);
    isReachable.mockResolvedValue(true);

    events.dispatchEvent(new Event("online"));
    await advance(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("doesn't reload if the page turned busy while the probe ran", async () => {
    const probe = Promise.withResolvers<boolean>();
    isReachable.mockReturnValueOnce(probe.promise);
    scheduler.request();
    const dialog = append('<div role="dialog"></div>');
    probe.resolve(true);
    await advance(0);
    expect(reload).not.toHaveBeenCalled();

    dialog.remove();
    await advance(SAFE_RELOAD_POLL_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("probes after navigation and still waits for a held task", async () => {
    const release = holds.hold();
    scheduler.request();
    scheduler.navigationCompleted();
    await advance(0);
    expect(isReachable).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    release();

    scheduler.navigationCompleted();
    await advance(SAFE_RELOAD_POLL_MS * 3);
    expect(isReachable).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(false);
  });

  it("keeps an unreachable destination pending and re-probes a later navigation immediately", async () => {
    isReachable.mockResolvedValue(false);
    scheduler.request();
    await advance(0);
    expect(isReachable).toHaveBeenCalledTimes(1);

    scheduler.navigationCompleted();
    await advance(0);
    expect(isReachable).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(true);

    isReachable.mockResolvedValue(true);
    scheduler.navigationCompleted();
    await advance(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("discards a previous route's successful probe when navigation overtakes it", async () => {
    const probe = Promise.withResolvers<boolean>();
    isReachable.mockReturnValueOnce(probe.promise).mockResolvedValue(false);
    scheduler.request();
    scheduler.navigationCompleted();
    await advance(0);
    expect(isReachable).toHaveBeenCalledTimes(1);

    probe.resolve(true);
    await advance(1);
    expect(isReachable).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(true);
  });

  it("doesn't reload after stopping while a probe is in flight", async () => {
    const probe = Promise.withResolvers<boolean>();
    isReachable.mockReturnValueOnce(probe.promise);
    scheduler.request();
    scheduler.stop();
    probe.resolve(true);
    await advance(0);
    expect(reload).not.toHaveBeenCalled();
  });

  it("stops watching once stopped", async () => {
    holds.hold();
    scheduler.request();
    scheduler.stop();
    holds.hold()();
    events.dispatchEvent(new Event("online"));
    await advance(SAFE_RELOAD_POLL_MS * 5);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("holdUpdatesWhile", () => {
  it("holds only while busy and releases through its cleanup", () => {
    expect(holdUpdatesWhile(false, holds)).toBeUndefined();
    expect(holds.held).toBe(false);
    const release = holdUpdatesWhile(true, holds);
    expect(holds.held).toBe(true);
    release?.();
    expect(holds.held).toBe(false);
  });
});
