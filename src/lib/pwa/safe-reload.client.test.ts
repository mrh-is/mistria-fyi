import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSafeReload, hasOpenDialog, isEditing, SAFE_RELOAD_POLL_MS } from "./safe-reload.js";
import { holdUpdatesWhile, UpdateHolds } from "./update-holds.js";

import type { SafeReload } from "./safe-reload.js";

let holds: UpdateHolds;
let reload: ReturnType<typeof vi.fn<() => void>>;
let scheduler: SafeReload;

beforeEach(() => {
  vi.useFakeTimers();
  holds = new UpdateHolds();
  reload = vi.fn();
  scheduler = createSafeReload({ holds, reload });
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
  it("never reloads without an update", () => {
    vi.advanceTimersByTime(SAFE_RELOAD_POLL_MS * 10);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(false);
    expect(scheduler.claimNavigation()).toBe(false);
  });

  it("reloads at once when the page isn't busy, and only once", () => {
    scheduler.request();
    scheduler.request();
    vi.advanceTimersByTime(SAFE_RELOAD_POLL_MS * 5);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits out a held task and reloads once it's released", () => {
    const release = holds.hold();
    scheduler.request();
    vi.advanceTimersByTime(SAFE_RELOAD_POLL_MS * 5);
    expect(reload).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(true);

    release();
    vi.advanceTimersByTime(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits until every overlapping hold is released", () => {
    const first = holds.hold();
    const second = holds.hold();
    scheduler.request();
    first();
    first();
    vi.advanceTimersByTime(SAFE_RELOAD_POLL_MS);
    expect(reload).not.toHaveBeenCalled();
    second();
    vi.advanceTimersByTime(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits out an open dialog and reloads once it closes", () => {
    const dialog = append('<div role="dialog" aria-modal="true"></div>');
    scheduler.request();
    vi.advanceTimersByTime(SAFE_RELOAD_POLL_MS * 3);
    expect(reload).not.toHaveBeenCalled();

    dialog.remove();
    vi.advanceTimersByTime(SAFE_RELOAD_POLL_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits while a field has focus and reloads once focus leaves it", () => {
    const field = append("<textarea></textarea>");
    field.focus();
    scheduler.request();
    vi.advanceTimersByTime(SAFE_RELOAD_POLL_MS * 3);
    expect(reload).not.toHaveBeenCalled();

    field.blur();
    vi.advanceTimersByTime(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("hands the next navigation the reload unless a task holds the update off", () => {
    append('<div role="dialog"></div>');
    const release = holds.hold();
    scheduler.request();
    expect(scheduler.claimNavigation()).toBe(false);
    release();

    // A dialog stays behind when the player leaves the page, so it doesn't block this.
    expect(scheduler.claimNavigation()).toBe(true);
    // The navigation reloads; nothing else does, and a second navigation isn't handed one.
    vi.advanceTimersByTime(SAFE_RELOAD_POLL_MS * 3);
    expect(reload).not.toHaveBeenCalled();
    expect(scheduler.claimNavigation()).toBe(false);
    expect(scheduler.pending).toBe(false);
  });

  it("stops watching once stopped", () => {
    holds.hold();
    scheduler.request();
    scheduler.stop();
    holds.hold()();
    vi.advanceTimersByTime(SAFE_RELOAD_POLL_MS * 5);
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
