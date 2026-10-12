import { afterEach, describe, expect, it, vi } from "vitest";

import { trackVisualViewport } from "#lib/attachments/visual-viewport.js";

class FakeVisualViewport extends EventTarget {
  height = 800;
  offsetTop = 0;

  move(offsetTop: number, height: number, type: "resize" | "scroll"): void {
    this.offsetTop = offsetTop;
    this.height = height;
    this.dispatchEvent(new Event(type));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function attach(): { dispose: () => void; element: HTMLElement; viewport: FakeVisualViewport } {
  const viewport = new FakeVisualViewport();
  vi.stubGlobal("visualViewport", viewport);
  const element = document.createElement("div");
  const dispose = trackVisualViewport(element);
  if (typeof dispose !== "function") throw new Error("Expected a cleanup function");
  return { dispose, element, viewport };
}

function pinned(element: HTMLElement): [string, string] {
  return [
    element.style.getPropertyValue("--visual-viewport-top"),
    element.style.getPropertyValue("--visual-viewport-height"),
  ];
}

describe("trackVisualViewport", () => {
  it("mirrors the visible viewport as it shrinks for the keyboard and scrolls", () => {
    const { dispose, element, viewport } = attach();
    expect(pinned(element)).toEqual(["0px", "800px"]);

    viewport.move(0, 420, "resize");
    expect(pinned(element)).toEqual(["0px", "420px"]);

    viewport.move(260, 420, "scroll");
    expect(pinned(element)).toEqual(["260px", "420px"]);
    dispose();
  });

  it("stops tracking and clears its properties when detached", () => {
    const { dispose, element, viewport } = attach();
    dispose();

    viewport.move(260, 420, "scroll");
    expect(pinned(element)).toEqual(["", ""]);
  });

  it("leaves the CSS fallbacks in charge without a visual viewport", () => {
    vi.stubGlobal("visualViewport", undefined);
    const element = document.createElement("div");

    expect(trackVisualViewport(element)).toBeUndefined();
    expect(element.getAttribute("style")).toBeNull();
  });
});
