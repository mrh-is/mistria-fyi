import { describe, expect, it } from "vitest";

import { formatImportAge } from "./import-age.js";

describe("formatImportAge", () => {
  it.each([
    [0, "now"],
    [30, "now"],
    [120, "2 minutes ago"],
    [7200, "2 hours ago"],
    [172_800, "2 days ago"],
  ])("formats an import %i seconds ago", (seconds, expected) => {
    expect(formatImportAge(0, seconds * 1000, "en")).toBe(expected);
  });

  it("uses the current locale", () => {
    expect(formatImportAge(0, 120_000, "fr")).toBe("il y a 2 minutes");
  });

  it("handles a future timestamp after a clock change", () => {
    expect(formatImportAge(120_000, 0, "en")).toBe("now");
  });
});
