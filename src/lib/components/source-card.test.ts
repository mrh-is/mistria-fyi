import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import SourceCard from "$lib/components/source-card.svelte";

describe("SourceCard", () => {
  it("renders readable timing context beside a source description", () => {
    const { body } = render(SourceCard, {
      props: {
        sourceBadges: [{ seasons: ["summer"] }],
        sources: [{ type: "default" }],
        sourceSegments: [["Catch fishing in Pond"]],
      },
    });

    expect(body).toContain("Catch fishing in Pond");
    expect(body).toContain(">Summer</span>");
  });

  it("does not invent timing context for an unrestricted source", () => {
    const { body } = render(SourceCard, {
      props: {
        sourceBadges: [{}],
        sources: [{ type: "default" }],
        sourceSegments: [["Buy from Balor's Wagon"]],
      },
    });

    expect(body).not.toContain("restriction-chip");
  });
});
