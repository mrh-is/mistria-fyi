import { beforeEach, describe, expect, it, vi } from "vitest";

import TrackerRow from "#lib/components/tracker-row.svelte";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderToFragmentWithFeedback } from "#lib/test-utils/render-to-fragment-with-feedback.js";

describe("TrackerRow", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  const reportProps = {
    fact: "almanacRecipes/cherry_cobbler",
    reportCategory: "recipe" as const,
    reportEntityId: "cherry_cobbler",
  };

  it("renders a spoiler overlay for a spoilered row", () => {
    const { container, queries } = renderToFragmentWithFeedback(TrackerRow, {
      props: {
        display: { mode: "spoilered" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
        sprite: "spr_ui_item_cherry_cobbler",
      },
    });
    const cover = queries.getByRole("button", { name: "Reveal spoiler" });
    expect(cover.querySelector("[aria-hidden='true']")?.textContent).toContain("Cherry Cobbler");
    expect(queries.getByRole("button", { name: "Check spoilered item" })).toBeTruthy();
    expect(container.querySelector<HTMLElement>("[data-sprite-slot]")?.dataset.spriteSlot).toBe(
      "spoilered",
    );
    expect(container.querySelector("image")?.getAttribute("crossorigin")).toBe("anonymous");
  });

  it("reveals the name for a completed row, unlike a spoilered one", () => {
    const { container, queries } = renderToFragmentWithFeedback(TrackerRow, {
      props: {
        display: { mode: "completed" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
        sprite: "spr_ui_item_cherry_cobbler",
      },
    });

    expect(queries.getByText("Cherry Cobbler")).toBeTruthy();
    expect(queries.queryByRole("button", { name: "Reveal spoiler" })).toBeNull();
    expect(container.querySelector<HTMLElement>("[data-sprite-slot]")?.dataset.spriteSlot).toBe(
      "complete",
    );
  });

  it("shows the entity name for a visible row", () => {
    const { container, queries } = renderToFragmentWithFeedback(TrackerRow, {
      props: {
        display: { mode: "incomplete" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
        sprite: "spr_ui_item_cherry_cobbler",
      },
    });

    expect(queries.getByText("Cherry Cobbler")).toBeTruthy();
    expect(queries.getByRole("button", { name: "Check Cherry Cobbler" })).toBeTruthy();
    expect(container.querySelector<HTMLElement>("[data-sprite-slot]")?.dataset.spriteSlot).toBe(
      "ready",
    );
  });

  it("marks a completed row for uncheck", () => {
    const { queries } = renderToFragmentWithFeedback(TrackerRow, {
      props: {
        display: { mode: "completed" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });

    expect(queries.getByText("Cherry Cobbler")).toBeTruthy();
    expect(queries.getByRole("button", { name: "Uncheck Cherry Cobbler" })).toBeTruthy();
  });

  it("renders a clipped tracker paper and persistent source paper when sourced", () => {
    const { container, queries } = renderToFragmentWithFeedback(TrackerRow, {
      props: {
        display: { mode: "incomplete" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
        sources: [{ type: "default" }],
      },
    });

    const control = queries.getByRole("button", { name: "Cherry Cobbler sources" });
    expect(control.getAttribute("aria-controls")).toMatch(/^sources-cherry-cobbler-/);
    expect(container.querySelector<HTMLElement>("[data-tracker-row]")?.dataset.sourceState).toBe(
      "closed",
    );
    const paper = container.querySelector("[data-tracker-paper]");
    expect(paper?.querySelector(".tracker-paper__surface--cutout")).not.toBeNull();
    const diagonal = paper?.querySelector("[data-tracker-paper-diagonal] path");
    expect(diagonal?.getAttribute("d")).toBe("M 26.5 0.5 L 0.5 26.5");
    expect(diagonal?.getAttribute("stroke-width")).toBe("1");
    expect(diagonal?.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    expect(diagonal?.getAttribute("shape-rendering")).toBe("geometricPrecision");
    expect(container.querySelector("[data-source-paper]")).not.toBeNull();
  });

  it("renders no source paper or diagonal when there are no sources", () => {
    const { container } = renderToFragmentWithFeedback(TrackerRow, {
      props: {
        display: { mode: "incomplete" },
        ...reportProps,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });

    expect(container.querySelector<HTMLElement>("[data-tracker-row]")?.dataset.sourceState).toBe(
      "none",
    );
    expect(container.querySelector("[data-tracker-paper]")).not.toBeNull();
    expect(container.querySelector("[data-tracker-paper-diagonal]")).toBeNull();
    expect(container.querySelector("[data-source-paper]")).toBeNull();
  });
});
