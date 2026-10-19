import { describe, expect, it } from "vitest";

import { trackerIndex } from "#lib/data/index.js";

describe("categorySourceTypes", () => {
  it("registers the mount appearances' sources for the animals page", () => {
    expect(trackerIndex.categorySourceTypes.animals).toContain("horse_statue");
  });
});
