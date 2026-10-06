import { describe, expect, it, vi } from "vitest";

import { compareStrings } from "./ordering.js";

describe("compareStrings", () => {
  it("orders IDs, punctuation, case, and accented names without locale collation", () => {
    const collate = vi.spyOn(String.prototype, "localeCompare").mockImplementation(() => {
      throw new Error("Host collation must not be used");
    });
    try {
      expect(["é", "z", "a_b", "a-b", "A", "a"].toSorted(compareStrings)).toEqual([
        "A",
        "a",
        "a-b",
        "a_b",
        "z",
        "é",
      ]);
      expect(compareStrings("same", "same")).toBe(0);
    } finally {
      collate.mockRestore();
    }
  });
});
