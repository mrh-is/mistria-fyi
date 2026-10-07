import { describe, expect, it } from "vitest";

import { budgetFailures, timingBudgets, timingSummary } from "./vitest-timings.js";

const files = [{ durationMs: 5000, file: "scripts/example.test.ts", project: "node" }];
const budgets = { fileMs: 5000, stepMs: 60_000 };

describe("Vitest timing budgets", () => {
  it("accepts a run exactly at both ceilings", () => {
    expect(budgetFailures(files, 60_000, budgets)).toEqual([]);
  });

  it("fails slow files even when the total step fits", () => {
    expect(budgetFailures([{ ...files[0], durationMs: 5001 }], 10_000, budgets)).toEqual([
      "scripts/example.test.ts: 5001 ms exceeds the 5000 ms file budget",
    ]);
  });

  it("fails wall-time growth even when all files fit", () => {
    expect(budgetFailures(files, 60_001, budgets)).toEqual([
      "Vitest step: 60001 ms exceeds the 60000 ms wall budget",
    ]);
  });

  it("fails absent or nonfinite measurements", () => {
    expect(budgetFailures([], 0, budgets)).toContain("Vitest reported no test files");
    expect(
      budgetFailures([{ ...files[0], durationMs: Number.NaN }], Infinity, budgets),
    ).toHaveLength(2);
  });

  it("scales budgets by runner class and allows coverage overhead only nightly", () => {
    expect(timingBudgets(2, false)).toEqual({ fileMs: 10_000, stepMs: 180_000 });
    expect(timingBudgets(4, false)).toEqual({ fileMs: 5000, stepMs: 90_000 });
    expect(timingBudgets(4, true)).toEqual({ fileMs: 5000, stepMs: 300_000 });
  });

  it("publishes every file, slowest first, with the wall-time budget", () => {
    const summary = timingSummary(
      [...files, { ...files[0], durationMs: 6000, file: "slow.test.ts" }],
      20_000,
      budgets,
    );
    expect(summary).toContain("Wall time: 20.00 s; budget: 60 s");
    expect(summary.indexOf("slow.test.ts")).toBeLessThan(
      summary.indexOf("scripts/example.test.ts"),
    );
  });
});
