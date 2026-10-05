import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";

import TrackerRowStack from "#lib/components/tracker-row-stack.svelte";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

describe("TrackerRowStack", () => {
  it("renders a direct row sequence with explicit source states", () => {
    const children = createRawSnippet(() => ({
      render: () => `
        <div data-tracker-row data-source-state="closed"></div>
        <div data-tracker-row data-source-state="none"></div>
        <div data-tracker-row data-source-state="closed"></div>
      `,
    }));
    const { container } = renderToFragment(TrackerRowStack, { props: { children } });

    const stack = container.querySelector("[data-tracker-row-stack]");
    const rows = [...(stack?.querySelectorAll<HTMLElement>("[data-tracker-row]") ?? [])];
    expect(rows.map((row) => row.dataset.sourceState)).toEqual(["closed", "none", "closed"]);
  });
});
