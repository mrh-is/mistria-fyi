import { afterEach, describe, expect, it, vi } from "vitest";

import { trapFocus } from "#lib/attachments/trap-focus.js";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});

function mount() {
  const panel = document.createElement("section");
  panel.innerHTML =
    '<button>First</button><button disabled>Disabled</button><input tabindex="-1"><a href="/">Link</a><select><option>Choice</option></select><div tabindex="0">Last</div>';
  document.body.append(panel);
  const onclose = vi.fn();
  dispose = trapFocus(onclose)(panel) ?? undefined;
  return { onclose, panel };
}

function required(panel: HTMLElement, selector: string): HTMLElement {
  const element = panel.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing fixture ${selector}`);
  return element;
}

function escape() {
  return document.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
  );
}

function tab(shiftKey = false) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "Tab",
    shiftKey,
  });
  document.dispatchEvent(event);
  return event;
}

describe("trapFocus", () => {
  it("wraps across links, selects, and custom tab stops while skipping negative tab stops", () => {
    const { panel } = mount();
    const first = required(panel, "button");
    const last = required(panel, "div");
    first.focus();
    expect(tab(true).defaultPrevented).toBe(true);
    expect(last).toHaveFocus();
    tab();
    expect(first).toHaveFocus();
    required(panel, "select").focus();
    expect(tab().defaultPrevented).toBe(false);
  });

  it("skips hidden and inert controls", () => {
    const { panel } = mount();
    required(panel, "div").hidden = true;
    const select = required(panel, "select");
    select.style.display = "none";
    const link = required(panel, "a");
    link.setAttribute("inert", "");
    required(panel, "button").focus();
    tab(true);
    expect(panel.querySelector("button")).toHaveFocus();
  });

  it("lets only the innermost trap close and resumes the outer trap after cleanup", () => {
    const { onclose, panel } = mount();
    const nested = document.createElement("section");
    panel.append(nested);
    const closeNested = vi.fn();
    const disposeNested = trapFocus(closeNested)(nested);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
    );
    expect(closeNested).toHaveBeenCalledTimes(1);
    expect(onclose).not.toHaveBeenCalled();
    disposeNested?.();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
    );
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it("recovers focus from outside and contains an empty panel", () => {
    const { panel } = mount();
    expect(tab().defaultPrevented).toBe(true);
    expect(panel.querySelector("button")).toHaveFocus();
    panel.replaceChildren();
    expect(tab().defaultPrevented).toBe(true);
  });

  it("closes once on Escape and removes its listener on cleanup", () => {
    const { onclose } = mount();
    escape();
    expect(onclose).toHaveBeenCalledTimes(1);
    dispose?.();
    escape();
    expect(onclose).toHaveBeenCalledTimes(1);
  });
});
