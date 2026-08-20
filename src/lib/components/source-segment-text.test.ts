import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import SourceSegmentText from "$lib/components/source-segment-text.svelte";
import { userState } from "$lib/stores/user-state.svelte.js";

import type { SourceSegment } from "$lib/utils/source-segments.js";

afterEach(() => {
  userState.resetAll();
});

describe("SourceSegmentText", () => {
  it("preserves structural text while hiding a gated fragment", () => {
    const segments: SourceSegment[] = [
      "Craft at ",
      {
        condition: { type: "minesLevel", floor: 90 },
        revealed: ["the Dragon Forge (Mines level 90)"],
      },
    ];
    const { body } = render(SourceSegmentText, { props: { segments } });
    expect(body).toContain("Craft at");
    expect(body).toContain("Redacted");
    expect(body).not.toContain("Dragon Forge");
  });

  it("reveals a fragment when progression satisfies its condition", () => {
    userState.setMineFloor(90);
    const segments: SourceSegment[] = [
      {
        condition: { type: "minesLevel", floor: 90 },
        revealed: ["the Dragon Forge (Mines level 90)"],
      },
    ];
    const { body } = render(SourceSegmentText, { props: { segments } });
    expect(body).toContain("Dragon Forge");
    expect(body).not.toContain("Redacted");
  });
});
