import { describe, expect, it } from "vitest";

import { isReportCategory, REPORT_CATEGORIES } from "./types.js";

describe("report categories", () => {
  it("are unique, stable kebab-case keys", () => {
    expect(new Set(REPORT_CATEGORIES).size).toBe(REPORT_CATEGORIES.length);
    for (const category of REPORT_CATEGORIES) {
      expect(category).toMatch(/^[a-z]+(-[a-z]+)*$/u);
    }
  });

  it("recognizes only the known keys", () => {
    expect(isReportCategory("pet-skin")).toBe(true);
    expect(isReportCategory("pet skin")).toBe(false);
    expect(isReportCategory("Recipes")).toBe(false);
  });
});
