import { fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, it, vi } from "vitest";

import TrackerRowList from "#lib/components/tracker-row-list.svelte";
import { SECTION_LIMIT } from "#lib/utils/row-display.js";

const row = createRawSnippet<[string]>((item) => ({
  render: () => `<div data-tracker-row data-source-state="none">${item()}</div>`,
}));

function names(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Row ${index}`);
}

function renderList(props: {
  expanded?: boolean;
  items: string[];
  limited?: boolean;
  loadingMessage?: string;
  onShowMore?: () => void;
  renderedCount?: number;
  showEmpty?: boolean;
}) {
  return render(TrackerRowList<string>, { getKey: (item: string) => item, row, ...props });
}

describe("TrackerRowList", () => {
  it("renders every row inside one stack", () => {
    const view = renderList({ items: names(3) });

    expect(view.container.querySelectorAll("[data-tracker-row-stack]")).toHaveLength(1);
    expect(view.container.querySelectorAll("[data-tracker-row]")).toHaveLength(3);
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

  it("caps a limited section & expands through the callback", async () => {
    const onShowMore = vi.fn();
    const view = renderList({ items: names(SECTION_LIMIT + 7), limited: true, onShowMore });

    expect(view.container.querySelectorAll("[data-tracker-row]")).toHaveLength(SECTION_LIMIT);
    await fireEvent.click(screen.getByRole("button", { name: /7/ }));
    expect(onShowMore).toHaveBeenCalledTimes(1);

    await view.rerender({ expanded: true });
    expect(view.container.querySelectorAll("[data-tracker-row]")).toHaveLength(SECTION_LIMIT + 7);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("clamps to the progressive render count & reports loading at zero", async () => {
    const view = renderList({ items: names(5), loadingMessage: "Loading", renderedCount: 0 });

    expect(view.container.querySelectorAll("[data-tracker-row]")).toHaveLength(0);
    expect(screen.getByText("Loading")).toBeInTheDocument();

    await view.rerender({ renderedCount: 2 });
    expect(view.container.querySelectorAll("[data-tracker-row]")).toHaveLength(2);
    expect(screen.queryByText("Loading")).toBeNull();
  });
});
