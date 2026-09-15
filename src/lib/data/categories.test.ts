import { describe, expect, it } from "vitest";

import { categoryForKey } from "./categories.js";

describe("categoryForKey", () => {
  it("labels the npcs category as Characters", () => {
    expect(categoryForKey("npcs").name).toBe("Characters");
  });
});
