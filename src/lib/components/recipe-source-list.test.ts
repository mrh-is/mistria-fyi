import { render } from "svelte/server";
import { beforeEach, describe, expect, it } from "vitest";

import RecipeSourceList from "$lib/components/recipe-source-list.svelte";
import { userState } from "$lib/stores/user-state.svelte.js";

import type { AcquisitionSource } from "$lib/types/tracker-data.js";
import type { SourceSegment } from "$lib/utils/source-segments.js";

describe("RecipeSourceList", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  it("renders every source through its index-aligned segment tree", () => {
    const sources: AcquisitionSource[] = [{ type: "beach_cave_chest" }, { type: "default" }];
    const sourceSegments: SourceSegment[][] = [
      ["Find in the Gold Treasure Chest in the Beach Cave"],
      ["Available from the start"],
    ];

    const { body } = render(RecipeSourceList, { props: { sources, sourceSegments } });

    expect(body).toContain('data-source-type="beach_cave_chest"');
    expect(body).toContain('data-source-type="default"');
    expect(body).toContain("Find in the Gold Treasure Chest in the Beach Cave");
    expect(body).toContain("Available from the start");
  });
});
