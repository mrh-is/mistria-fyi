import { fireEvent, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import TrackerRow from "#lib/components/tracker-row.svelte";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { SPRITE_PREVIEW_FADE_MS, SPRITE_PREVIEW_HOLD_MS } from "#lib/utils/row-timing.js";

describe("TrackerRow reportable metadata", () => {
  it("reveals a ready sprite with the spoiler name", async () => {
    const view = renderWithFeedback(TrackerRow, {
      display: { mode: "spoilered" },
      fact: "almanac/turnip",
      name: "Turnip",
      onToggle: vi.fn(),
      reportCategory: "almanac-item",
      reportEntityId: "turnip",
      sprite: "spr_ui_item_turnip",
    });

    expect(view.container.querySelector("[data-sprite-slot='spoilered']")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Reveal spoiler" }));

    expect(view.container.querySelector("[data-sprite-slot='ready']")).toBeTruthy();
    expect(screen.getByText("Turnip")).toBeInTheDocument();
  });

  it("registers the whole row and preserves completion behavior", async () => {
    const feedbackContext = new FeedbackContext();
    const onToggle = vi.fn();
    const view = renderWithFeedback(
      TrackerRow,
      {
        display: { mode: "incomplete" },
        fact: "almanacRecipes/turnip",
        name: "Tomato Soup",
        onToggle,
        reportCategory: "recipe",
        reportEntityId: "tomato_soup",
      },
      feedbackContext,
    );

    await waitFor(() => {
      expect(feedbackContext.registrations.size).toBe(1);
    });
    expect([...feedbackContext.registrations.values()][0]).toMatchObject({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
    });

    await fireEvent.click(screen.getByRole("button", { name: "Check Tomato Soup" }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(feedbackContext.registrations.size).toBe(0);
  });

  it("keeps one source paper and control while toggling its content", async () => {
    const view = renderWithFeedback(TrackerRow, {
      display: { mode: "incomplete" },
      fact: "almanac/turnip",
      name: "Amberjack",
      onToggle: vi.fn(),
      reportCategory: "almanac-item",
      reportEntityId: "amberjack",
      sources: [{ type: "default" }],
    });
    const sourceButton = screen.getByRole("button", { name: "Amberjack sources" });
    const sourcePaper = view.container.querySelector("[data-source-paper]");
    const row = view.container.querySelector<HTMLElement>("[data-tracker-row]");
    const contentId = sourceButton.getAttribute("aria-controls");

    expect(sourcePaper).toBeTruthy();
    expect(view.container.querySelector(".source-card")).toBeNull();
    expect(row?.dataset.sourceState).toBe("closed");
    expect(sourceButton.getAttribute("aria-expanded")).toBe("false");
    expect(contentId).toBeTruthy();
    expect(document.getElementById(contentId ?? "")).toBeTruthy();
    expect(view.container.querySelector(".source-paper__panel")?.getAttribute("aria-hidden")).toBe(
      "true",
    );

    await fireEvent.click(sourceButton);
    expect(sourceButton.getAttribute("aria-expanded")).toBe("true");
    expect(row?.dataset.sourceState).toBe("open");
    const sourceCard = view.container.querySelector(".source-card");
    expect(sourceCard).toBeTruthy();
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
    expect(row?.dataset.sourceState).toBe("closed");
    expect(view.container.querySelector(".source-paper__panel")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(view.container.querySelector("[data-source-paper]")).toBe(sourcePaper);
    expect(view.container.querySelector("[data-source-paper-stationary-control]")).toBeNull();
    expect(view.container.querySelector(".source-card")).toBe(sourceCard);
    await fireEvent.click(sourceButton);
    expect(sourceButton.getAttribute("aria-expanded")).toBe("true");
    expect(view.container.querySelector(".source-card")).toBe(sourceCard);
  });

  it("keeps multiple source papers expanded independently", async () => {
    const first = renderWithFeedback(TrackerRow, {
      display: { mode: "incomplete" },
      fact: "almanac/turnip",
      name: "Amberjack",
      onToggle: vi.fn(),
      reportCategory: "almanac-item",
      reportEntityId: "amberjack",
      sources: [{ type: "default" }],
    });
    const second = renderWithFeedback(TrackerRow, {
      display: { mode: "incomplete" },
      fact: "almanac/turnip",
      name: "Cod",
      onToggle: vi.fn(),
      reportCategory: "almanac-item",
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
    vi.stubGlobal("requestAnimationFrame", (onFrame: FrameRequestCallback) => {
      onFrame(0);
      return 0;
    });

    const list = document.createElement("div");
    document.body.append(list);
    const first = renderWithFeedback(TrackerRow, {
      display: { mode: "incomplete" },
      fact: "almanac/turnip",
      name: "First item",
      onToggle: () => {
        void first.rerender({
          display: { leaving: true, mode: "completed" },
          fact: "almanac/turnip",
          name: "First item",
          onToggle: vi.fn(),
          reportCategory: "almanac-item",
          reportEntityId: "first",
        });
      },
      reportCategory: "almanac-item",
      reportEntityId: "first",
    });
    const second = renderWithFeedback(TrackerRow, {
      display: { mode: "incomplete" },
      fact: "almanac/turnip",
      name: "Second item",
      onToggle: vi.fn(),
      reportCategory: "almanac-item",
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
    // Testing Library's cleanup removes only its own containers, not this hand-built list.
    list.remove();
    vi.unstubAllGlobals();
  });
});

function previewLayer(container: HTMLElement): Element | null {
  return container.querySelector("[data-sprite-layer='preview']");
}

describe("TrackerRow sprite preview", () => {
  const props = {
    display: { mode: "incomplete" },
    fact: "almanac/turnip",
    name: "Animated Clouds Window",
    reportCategory: "almanac-item",
    reportEntityId: "animated_clouds_window_blue",
    sprite: "spr_ui_item_animated_clouds_window_blue",
  } as const;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals the full sprite for a few seconds without toggling the row", async () => {
    vi.useFakeTimers();
    const onToggle = vi.fn();
    const view = renderWithFeedback(TrackerRow, { ...props, onToggle });
    const button = screen.getByRole("button", { name: "Show Animated Clouds Window in color" });

    expect(previewLayer(view.container)).toBeNull();
    await fireEvent.click(button);

    expect(previewLayer(view.container)).toBeTruthy();
    expect(onToggle).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SPRITE_PREVIEW_HOLD_MS - 1);
    expect(previewLayer(view.container)).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1 + SPRITE_PREVIEW_FADE_MS);
    expect(previewLayer(view.container)).toBeNull();
  });

  it("restarts the hold when activated again", async () => {
    vi.useFakeTimers();
    const view = renderWithFeedback(TrackerRow, { ...props, onToggle: vi.fn() });
    const button = screen.getByRole("button", { name: "Show Animated Clouds Window in color" });

    await fireEvent.click(button);
    await vi.advanceTimersByTimeAsync(SPRITE_PREVIEW_HOLD_MS - 100);
    await fireEvent.click(button);
    // Past where the first hold & its fade would have ended had the second click not restarted it.
    await vi.advanceTimersByTimeAsync(100 + SPRITE_PREVIEW_FADE_MS + 1);
    expect(previewLayer(view.container)).toBeTruthy();
  });

  it("is a focusable native button, so Enter & Space activate it", async () => {
    const view = renderWithFeedback(TrackerRow, { ...props, onToggle: vi.fn() });
    const button = screen.getByRole("button", { name: "Show Animated Clouds Window in color" });

    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    button.focus();
    expect(document.activeElement).toBe(button);
    // A native button turns Enter & Space into click; the click is what reveals.
    await fireEvent.click(button);
    expect(previewLayer(view.container)).toBeTruthy();
  });

  it("offers no preview on completed rows, which already show the sticker", () => {
    renderWithFeedback(TrackerRow, {
      ...props,
      display: { mode: "completed" },
      onToggle: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: /in color/ })).toBeNull();
  });

  it("keeps a spoilered row's sprite behind the spoiler guard until it is revealed", async () => {
    const view = renderWithFeedback(TrackerRow, {
      ...props,
      display: { mode: "spoilered" },
      onToggle: vi.fn(),
    });

    expect(screen.queryByRole("button", { name: /in color/ })).toBeNull();
    expect(previewLayer(view.container)).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "Reveal spoiler" }));
    await fireEvent.click(
      screen.getByRole("button", { name: "Show Animated Clouds Window in color" }),
    );
    expect(previewLayer(view.container)).toBeTruthy();
  });
});
