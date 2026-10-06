import { afterEach, describe, expect, it } from "vitest";

import SourceSegmentText from "#lib/components/source-segment-text.svelte";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

import type { SourceSegment } from "#lib/sources/source-segments.js";

const defaultGetLocale = getLocale;

afterEach(() => {
  userState.resetAll();
  overwriteGetLocale(defaultGetLocale);
});

describe("SourceSegmentText", () => {
  it("localizes the screen-reader label for spoilered source text", () => {
    overwriteGetLocale(() => "fr");
    const { container } = renderToFragment(SourceSegmentText, {
      props: { segments: [{ spoilered: true }] },
    });
    expect(container.querySelector(".sr-only")?.textContent).toBe("Masqué");
    expect(container.querySelector("[aria-hidden='true']")?.textContent).toBe("███");
  });

  it("preserves structural text while spoilering a gated fragment", () => {
    const segments: SourceSegment[] = [
      "Craft at ",
      {
        condition: { type: "mineFloor", floor: 90 },
        unspoilered: ["the Dragon Forge (Mines level 90)"],
      },
    ];
    const { container, queries } = renderToFragment(SourceSegmentText, { props: { segments } });
    expect(container.textContent).toContain("Craft at");
    const cover = queries.getByRole("button", { name: "Reveal spoiler" });
    expect(cover.querySelector("[aria-hidden='true']")?.textContent).toContain("Dragon Forge");
  });

  it("reveals a fragment when progression satisfies its condition", () => {
    userState.setMineFloor(90);
    const segments: SourceSegment[] = [
      {
        condition: { type: "mineFloor", floor: 90 },
        unspoilered: ["the Dragon Forge (Mines level 90)"],
      },
    ];
    const { container, queries } = renderToFragment(SourceSegmentText, { props: { segments } });
    expect(container.textContent).toContain("Dragon Forge");
    expect(queries.queryByRole("button", { name: "Reveal spoiler" })).toBeNull();
  });
});
