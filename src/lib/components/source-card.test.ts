import { describe, expect, it } from "vitest";

import SourceCard from "#lib/components/source-card.svelte";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

describe("SourceCard", () => {
  it("renders readable timing context beside a source description", () => {
    const { container, queries } = renderToFragment(SourceCard, {
      props: {
        sourceBadges: [{ seasons: ["summer"] }],
        sources: [{ type: "default" }],
        sourceSegments: [["Catch fishing in Pond"]],
      },
    });

    expect(queries.getByText("Catch fishing in Pond")).toBeTruthy();
    expect(container.querySelector(".restriction-chip")?.textContent).toContain("Summer");
  });

  it("does not invent timing context for an unrestricted source", () => {
    const { container } = renderToFragment(SourceCard, {
      props: {
        sourceBadges: [{}],
        sources: [{ type: "default" }],
        sourceSegments: [["Buy from Balor's Wagon"]],
      },
    });

    expect(container.querySelector(".restriction-chip")).toBeNull();
  });
});
