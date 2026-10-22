import { render, screen } from "@testing-library/svelte";
import { createRawSnippet, tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TrackerRowList from "#lib/components/tracker-row-list.svelte";
import { INITIAL_ROW_BUDGET, RESTORE_SLACK } from "#lib/controllers/row-reveal.svelte.js";

const row = createRawSnippet<[string]>((item) => ({
  render: () => `<div data-tracker-row data-source-state="none">${item()}</div>`,
}));

function names(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Row ${index}`);
}

function renderList(props: { items: string[]; showEmpty?: boolean }) {
  return render(TrackerRowList<string>, { getKey: (item: string) => item, row, ...props });
}

function rowCount(container: Element): number {
  return container.querySelectorAll("[data-tracker-row]").length;
}

let queuedFrames: FrameRequestCallback[];

/** Lets the current task finish, which refills the shared rows-at-once budget. */
async function nextTask(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Runs queued animation frames, including those they queue, until none remain. */
async function runFrames(): Promise<void> {
  while (queuedFrames.length > 0) {
    const frames = queuedFrames;
    queuedFrames = [];
    for (const onFrame of frames) onFrame(performance.now());
    // oxlint-disable-next-line no-await-in-loop -- each frame must flush before the next runs
    await tick();
  }
}

describe("TrackerRowList", () => {
  beforeEach(() => {
    queuedFrames = [];
    vi.stubGlobal("requestAnimationFrame", (onFrame: FrameRequestCallback) => {
      queuedFrames.push(onFrame);
      return queuedFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await nextTask();
  });

  it("renders every row inside one stack", () => {
    const view = renderList({ items: names(3) });

    expect(view.container.querySelectorAll("[data-tracker-row-stack]")).toHaveLength(1);
    expect(rowCount(view.container)).toBe(3);
    expect(view.container.querySelector("[data-tracker-empty]")).toBeNull();
  });

  it("shows the empty note when there are no rows", () => {
    renderList({ items: [] });

    expect(screen.getByText("No items match the current filters")).toBeInTheDocument();
  });

  it("omits the empty note when the parent owns it", () => {
    const view = renderList({ items: [], showEmpty: false });

    expect(view.container.querySelector("[data-tracker-empty]")).toBeNull();
  });

  it("renders a long list's first screenful at once & the rest over frames, with no button", async () => {
    const total = INITIAL_ROW_BUDGET * 6;
    const view = renderList({ items: names(total) });
    await tick();

    expect(rowCount(view.container)).toBe(INITIAL_ROW_BUDGET);
    expect(screen.queryByRole("button")).toBeNull();
    const list = view.container.querySelector<HTMLElement>("[data-tracker-row-list]");
    expect(list?.style.paddingBlockEnd).toMatch(/^[1-9][\d.]*px$/);
    expect(queuedFrames.length).toBeGreaterThan(0);

    await runFrames();

    expect(rowCount(view.container)).toBe(total);
    expect(view.container.textContent).toContain(`Row ${total - 1}`);
    expect(list?.style.paddingBlockEnd).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shares the first-paint budget between lists mounted together", async () => {
    const first = renderList({ items: names(INITIAL_ROW_BUDGET - 10) });
    const second = renderList({ items: names(INITIAL_ROW_BUDGET) });
    await tick();

    expect(rowCount(first.container)).toBe(INITIAL_ROW_BUDGET - 10);
    expect(rowCount(second.container)).toBe(10);

    await runFrames();

    expect(rowCount(second.container)).toBe(INITIAL_ROW_BUDGET);
  });

  it("brings back a row at once, but reveals a widened list over frames again", async () => {
    const total = INITIAL_ROW_BUDGET * 4;
    const view = renderList({ items: names(total) });
    await runFrames();
    expect(rowCount(view.container)).toBe(total);

    await view.rerender({ items: names(total - 1) });
    await view.rerender({ items: names(total) });
    expect(rowCount(view.container)).toBe(total);

    await view.rerender({ items: names(5) });
    await nextTask();
    await view.rerender({ items: names(total) });
    expect(rowCount(view.container)).toBe(5 + RESTORE_SLACK + INITIAL_ROW_BUDGET);

    await runFrames();
    expect(rowCount(view.container)).toBe(total);
  });

  it("renders a screenful at once when an empty list fills", async () => {
    const view = renderList({ items: [] });
    await nextTask();

    await view.rerender({ items: names(INITIAL_ROW_BUDGET * 2) });
    expect(rowCount(view.container)).toBe(INITIAL_ROW_BUDGET);
    expect(view.container.querySelector("[data-tracker-empty]")).toBeNull();
  });

  it("stops revealing rows once unmounted", async () => {
    const view = renderList({ items: names(INITIAL_ROW_BUDGET * 3) });
    await tick();
    view.unmount();

    await expect(runFrames()).resolves.toBeUndefined();
  });
});
