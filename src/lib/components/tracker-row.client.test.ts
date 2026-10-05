import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import TrackerRow from "#lib/components/tracker-row.svelte";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";

describe("TrackerRow reportable metadata", () => {
  it("reveals a ready sprite with the spoiler name", async () => {
    const view = render(TrackerRow, {
      display: { mode: "spoilered" },
      name: "Turnip",
      onToggle: vi.fn(),
      reportCategory: "almanac item",
      reportEntityId: "turnip",
      sprite: "spr_ui_item_turnip",
    });

    expect(view.container.querySelector("[data-sprite-slot='spoilered']")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Reveal spoiler" }));

    expect(view.container.querySelector("[data-sprite-slot='ready']")).toBeTruthy();
    expect(screen.getByText("Turnip")).toBeTruthy();
  });

  it("registers the whole row and preserves completion behavior", async () => {
    const feedbackContext = new FeedbackContext();
    const onToggle = vi.fn();
    const view = render(TrackerRow, {
      display: { mode: "visible" },
      feedbackContext,
      name: "Tomato Soup",
      onToggle,
      reportCategory: "recipe",
      reportEntityId: "tomato_soup",
    });

    await waitFor(() => {
      expect(feedbackContext.registrations.size).toBe(1);
    });
    expect([...feedbackContext.registrations.values()][0]).toMatchObject({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
    });

    await fireEvent.click(screen.getByRole("button", { name: "Check Tomato Soup" }));
    expect(onToggle).toHaveBeenCalledOnce();

    view.unmount();
    expect(feedbackContext.registrations.size).toBe(0);
  });

  it("keeps one source paper and control while toggling its content", async () => {
    const view = render(TrackerRow, {
      display: { mode: "visible" },
      name: "Amberjack",
      onToggle: vi.fn(),
      reportCategory: "almanac item",
      reportEntityId: "amberjack",
      sources: [{ type: "default" }],
    });
    const sourceButton = screen.getByRole("button", { name: "Amberjack sources" });
    const sourcePaper = view.container.querySelector("[data-source-paper]");
    const row = view.container.querySelector("[data-tracker-row]");
    const contentId = sourceButton.getAttribute("aria-controls");

    expect(sourcePaper).toBeTruthy();
    expect(row?.getAttribute("data-source-state")).toBe("closed");
    expect(sourceButton.getAttribute("aria-expanded")).toBe("false");
    expect(contentId).toBeTruthy();
    expect(document.getElementById(contentId ?? "")).toBeTruthy();
    expect(view.container.querySelector(".source-paper__panel")?.getAttribute("aria-hidden")).toBe(
      "true",
    );

    await fireEvent.click(sourceButton);
    expect(sourceButton.getAttribute("aria-expanded")).toBe("true");
    expect(row?.getAttribute("data-source-state")).toBe("open");
    expect(view.container.querySelector(".source-card")).toBeTruthy();
    expect(view.container.querySelector(".source-paper__panel")?.getAttribute("aria-hidden")).toBe(
      "false",
    );
    expect(view.container.querySelector("[data-source-paper]")).toBe(sourcePaper);
    expect(screen.getByRole("button", { name: "Amberjack sources" })).toBe(sourceButton);
    expect(sourcePaper?.contains(sourceButton)).toBe(true);

    const stationaryControl = view.container.querySelector(
      "[data-source-paper-stationary-control]",
    );
    expect(stationaryControl).toBeTruthy();
    if (!stationaryControl) throw new Error("Expected stationary source control");
    await fireEvent.click(stationaryControl);
    expect(sourceButton.getAttribute("aria-expanded")).toBe("false");
    expect(row?.getAttribute("data-source-state")).toBe("closed");
    expect(view.container.querySelector(".source-paper__panel")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(view.container.querySelector("[data-source-paper]")).toBe(sourcePaper);
    expect(view.container.querySelector("[data-source-paper-stationary-control]")).toBeNull();
  });

  it("keeps multiple source papers expanded independently", async () => {
    const first = render(TrackerRow, {
      display: { mode: "visible" },
      name: "Amberjack",
      onToggle: vi.fn(),
      reportCategory: "almanac item",
      reportEntityId: "amberjack",
      sources: [{ type: "default" }],
    });
    const second = render(TrackerRow, {
      display: { mode: "visible" },
      name: "Cod",
      onToggle: vi.fn(),
      reportCategory: "almanac item",
      reportEntityId: "cod",
      sources: [{ type: "default" }],
    });
    const firstButton = screen.getByRole("button", { name: "Amberjack sources" });
    const secondButton = screen.getByRole("button", { name: "Cod sources" });

    await fireEvent.click(firstButton);
    await fireEvent.click(secondButton);
    expect(firstButton.getAttribute("aria-expanded")).toBe("true");
    expect(secondButton.getAttribute("aria-expanded")).toBe("true");

    await fireEvent.click(firstButton);
    expect(firstButton.getAttribute("aria-expanded")).toBe("false");
    expect(secondButton.getAttribute("aria-expanded")).toBe("true");
    first.unmount();
    second.unmount();
  });

  it("moves focus to the next row after toggling a visible item", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    const list = document.createElement("div");
    document.body.append(list);
    const first = render(TrackerRow, {
      display: { mode: "visible" },
      name: "First item",
      onToggle: () => {
        void first.rerender({
          display: { leaving: true, mode: "completed" },
          name: "First item",
          onToggle: vi.fn(),
          reportCategory: "item",
          reportEntityId: "first",
        });
      },
      reportCategory: "item",
      reportEntityId: "first",
    });
    const second = render(TrackerRow, {
      display: { mode: "visible" },
      name: "Second item",
      onToggle: vi.fn(),
      reportCategory: "item",
      reportEntityId: "second",
    });
    const firstRow = first.container.firstElementChild;
    const secondRow = second.container.firstElementChild;
    expect(firstRow).toBeTruthy();
    expect(secondRow).toBeTruthy();
    list.dataset.trackerList = "";
    const firstStack = document.createElement("div");
    const secondStack = document.createElement("div");
    firstStack.append(firstRow as HTMLElement);
    secondStack.append(secondRow as HTMLElement);
    list.append(firstStack, secondStack);

    screen.getByRole("button", { name: "Check First item" }).focus();
    await fireEvent.click(screen.getByRole("button", { name: "Check First item" }));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Check Second item" }));
    vi.unstubAllGlobals();
  });
});
