import { createRawSnippet } from "svelte";
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import TrackerRowStack from "#lib/components/tracker-row-stack.svelte";

describe("TrackerRowStack", () => {
  it("renders a direct row sequence with explicit source states", () => {
    const children = createRawSnippet(() => ({
      render: () => `
        <div data-tracker-row data-source-state="closed"></div>
        <div data-tracker-row data-source-state="none"></div>
        <div data-tracker-row data-source-state="closed"></div>
      `,
    }));
    const { body } = render(TrackerRowStack, { props: { children } });

    expect(body.match(/data-tracker-row/g)).toHaveLength(4);
    expect(body).toContain("data-tracker-row-stack");
    expect(body).toContain('data-source-state="closed"');
    expect(body).toContain('data-source-state="none"');
  });
});
