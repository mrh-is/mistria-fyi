import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import { BookPanels } from "#lib/components/book/book-panels.svelte.js";

function button(entry: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.dataset.panelEntry = entry;
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("BookPanels", () => {
  it("toggles one panel at a time", () => {
    const panels = new BookPanels();
    panels.toggle("settings", null);
    expect(panels.active).toBe("settings");
    panels.toggle("clock", null);
    expect(panels.active).toBe("clock");
    panels.toggle("clock", null);
    expect(panels.active).toBeNull();
  });

  it("returns focus to the trigger when it still shows", async () => {
    const trigger = button("settings");
    const panels = new BookPanels();
    panels.open("settings", trigger);
    panels.close();
    await tick();
    expect(trigger).toHaveFocus();
  });

  // Whether the trigger shows needs layout, which happy-dom lacks; the browser tests in
  // `tests/accessibility/keyboard.spec.ts` resize across the breakpoint with a panel open.
  it("skips an equivalent that's inert", async () => {
    const trigger = button("feedback");
    const inertParent = document.createElement("div");
    inertParent.inert = true;
    inertParent.append(button("feedback"));
    document.body.append(inertParent);
    const live = button("feedback");
    const panels = new BookPanels();
    panels.open("feedback", trigger);
    trigger.remove();
    panels.close();
    await tick();
    expect(live).toHaveFocus();
  });

  it("keeps Contents' trigger for a panel opened from it", async () => {
    const contents = button("contents feedback settings");
    const row = document.createElement("button");
    document.body.append(row);
    const panels = new BookPanels();
    panels.open("contents", contents);
    panels.open("settings", row);
    row.remove();
    panels.close();
    await tick();
    expect(contents).toHaveFocus();
  });

  it("leaves focus alone when closed without restoring, or when another panel opens", async () => {
    const trigger = button("settings");
    const elsewhere = button("clock");
    elsewhere.focus();
    const panels = new BookPanels();
    panels.open("settings", trigger);
    panels.close(false);
    await tick();
    expect(elsewhere).toHaveFocus();

    panels.open("settings", trigger);
    panels.close();
    panels.open("clock", elsewhere);
    await tick();
    expect(elsewhere).toHaveFocus();
  });
});
