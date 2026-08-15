import { render } from "svelte/server";
import { beforeEach, describe, expect, it } from "vitest";

import RecipeSourceList from "$lib/components/recipe-source-list.svelte";
import { userState } from "$lib/stores/user-state.svelte.js";

import type { RecipeSource } from "$lib/types/tracker-data.js";
import type { SourceSegment } from "$lib/utils/source-segments.js";

describe("RecipeSourceList", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  it("renders every source through its index-aligned segment tree", () => {
    const sources: RecipeSource[] = [{ type: "dragon_forge" }, { type: "default" }];
    const sourceSegments: SourceSegment[][] = [
      [
        "Craft at ",
        {
          condition: { floor: 90, type: "minesLevel" },
          revealed: ["the Dragon Forge (Mines level 90)"],
        },
      ],
      ["Available from the start"],
    ];

    const { body } = render(RecipeSourceList, { props: { sources, sourceSegments } });

    expect(body).toContain('data-source-type="dragon_forge"');
    expect(body).toContain('data-source-type="default"');
    expect(body).toContain("Craft at");
    expect(body).toContain("Redacted");
    expect(body).not.toContain("Dragon Forge");
    expect(body).toContain("Available from the start");
  });
});
