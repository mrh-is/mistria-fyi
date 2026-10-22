import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import SectionGroupsHarness from "#lib/components/section-groups.test-harness.svelte";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";
import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

import type { SectionGrouping } from "#lib/controllers/section-grouping.svelte.js";

interface Section {
  count: number;
  id: string;
  total: number;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SectionGroups", () => {
  it("lists unfinished sections first, then finished ones under a Completed heading", async () => {
    renderGroups([
      { count: 1, id: "Artifacts", total: 3 },
      { count: 2, id: "Bugs", total: 2 },
      { count: 0, id: "Crops", total: 0 },
      { count: 3, id: "Dishes", total: 3 },
      { count: 0, id: "Fish", total: 4 },
    ]);
    await tick();

    // A filter that leaves nothing in scope doesn't finish a section.
    expect(headingOrder()).toEqual(["Artifacts", "Crops", "Fish", "Completed", "Bugs", "Dishes"]);
  });

  it("omits the Completed heading while every section is unfinished", async () => {
    renderGroups([
      { count: 1, id: "Artifacts", total: 3 },
      { count: 0, id: "Bugs", total: 2 },
    ]);
    await tick();

    expect(headingOrder()).toEqual(["Artifacts", "Bugs"]);
  });

  it("regroups a section as soon as its counts change outside a toggle", async () => {
    const { view } = renderGroups([
      { count: 1, id: "Artifacts", total: 3 },
      { count: 2, id: "Bugs", total: 2 },
    ]);
    await tick();

    await view.rerender({
      sections: [
        { count: 3, id: "Artifacts", total: 3 },
        { count: 2, id: "Bugs", total: 3 },
      ],
    });
    await tick();

    expect(headingOrder()).toEqual(["Bugs", "Completed", "Artifacts"]);
  });

  it("moves a section finished by a toggle only after the row-leaving window", async () => {
    vi.useFakeTimers();
    const { grouping, view } = renderGroups([
      { count: 1, id: "Artifacts", total: 2 },
      { count: 0, id: "Bugs", total: 2 },
    ]);
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: /^Artifacts,/ }));
    const row = screen.getByRole("button", { name: "Row in Artifacts" });
    row.focus();

    grouping.hold("Artifacts");
    await view.rerender({
      sections: [
        { count: 2, id: "Artifacts", total: 2 },
        { count: 0, id: "Bugs", total: 2 },
      ],
    });
    await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS - 1);
    expect(headingOrder()).toEqual(["Artifacts", "Bugs"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(headingOrder()).toEqual(["Bugs", "Completed", "Artifacts"]);
    expect(screen.getByRole("button", { name: /^Artifacts,/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Row in Artifacts" })).toBe(row);
    expect(document.activeElement).toBe(row);
  });

  it("keeps a section reopened by a toggle among the completed until the window passes", async () => {
    vi.useFakeTimers();
    const { grouping, view } = renderGroups([
      { count: 0, id: "Artifacts", total: 2 },
      { count: 2, id: "Bugs", total: 2 },
    ]);
    await tick();

    grouping.hold("Bugs");
    await view.rerender({
      sections: [
        { count: 0, id: "Artifacts", total: 2 },
        { count: 1, id: "Bugs", total: 2 },
      ],
    });
    await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS - 1);
    expect(headingOrder()).toEqual(["Artifacts", "Completed", "Bugs"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(headingOrder()).toEqual(["Artifacts", "Bugs"]);
  });

  it("restarts the window when a held section is toggled again", async () => {
    vi.useFakeTimers();
    const { grouping, view } = renderGroups([
      { count: 1, id: "Artifacts", total: 2 },
      { count: 0, id: "Bugs", total: 2 },
    ]);
    await tick();

    grouping.hold("Artifacts");
    await view.rerender({
      sections: [
        { count: 2, id: "Artifacts", total: 2 },
        { count: 0, id: "Bugs", total: 2 },
      ],
    });
    await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS - 1);
    grouping.hold("Artifacts");
    await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS - 1);
    expect(headingOrder()).toEqual(["Artifacts", "Bugs"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(headingOrder()).toEqual(["Bugs", "Completed", "Artifacts"]);
  });

  it("clears pending hold timers when it unmounts", async () => {
    vi.useFakeTimers();
    const { grouping, view } = renderGroups([{ count: 1, id: "Artifacts", total: 2 }]);
    await tick();

    grouping.hold("Artifacts");
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function headingOrder(): string[] {
  return screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent.trim().replace(/\d.*$/, "").trim());
}

function renderGroups(sections: Section[]): {
  grouping: SectionGrouping<string>;
  view: ReturnType<typeof render<typeof SectionGroupsHarness>>;
} {
  let grouping: SectionGrouping<string> | undefined;
  const view = render(SectionGroupsHarness, {
    feedbackContext: new FeedbackContext(),
    onGrouping: (created: SectionGrouping<string>) => {
      grouping = created;
    },
    sections,
  });
  if (!grouping) throw new Error("Expected the harness to create its grouping");
  return { grouping, view };
}
