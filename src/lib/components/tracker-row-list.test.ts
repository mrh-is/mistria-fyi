import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";

import TrackerRowList from "#lib/components/tracker-row-list.svelte";
import { INITIAL_ROW_BUDGET } from "#lib/controllers/row-reveal.svelte.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

const row = createRawSnippet<[string]>((item) => ({
  render: () => `<div data-tracker-row data-source-state="none">${item()}</div>`,
}));

describe("TrackerRowList on the server", () => {
  it("prerenders every row, with no reserved space or busy state", () => {
    const total = INITIAL_ROW_BUDGET * 4;
    const items = Array.from({ length: total }, (_, index) => `Row ${index}`);
    const { container } = renderToFragment(TrackerRowList<string>, {
      props: { getKey: (item: string) => item, items, row },
    });

    expect(container.querySelectorAll("[data-tracker-row]")).toHaveLength(total);
    expect(container.querySelector("[data-tracker-row-reserve]")).toBeNull();
    expect(container.querySelector("[data-tracker-row-list]")?.getAttribute("aria-busy")).toBe(
      "false",
    );
  });
});
