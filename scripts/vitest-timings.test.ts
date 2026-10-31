import { describe, expect, it } from "vitest";

import {
  parseTouchedFiles,
  timingResults,
  timingSummary,
  vitestArguments,
} from "./vitest-timings.js";

const timing = (durationMs: number, file = "scripts/example.test.ts") => ({
  durationMs,
  file,
  project: "node",
});
const touched = (...files: string[]) => new Set(files);

describe("Vitest timing limits", () => {
  it("says nothing about a file at the warning line", () => {
    expect(timingResults([timing(5000)], touched())).toEqual({ failures: [], warnings: [] });
  });

  it("warns about a slow file a pull request didn't change, however slow", () => {
    expect(timingResults([timing(5001)], touched())).toEqual({
      failures: [],
      warnings: ["scripts/example.test.ts took 5001 ms, over the 5000 ms warning line"],
    });
    expect(timingResults([timing(60_000)], touched()).failures).toEqual([]);
  });

  it("only warns about a changed file up to the failure line", () => {
    const results = timingResults([timing(15_000)], touched("scripts/example.test.ts"));
    expect(results.failures).toEqual([]);
    expect(results.warnings).toHaveLength(1);
  });

  it("fails a changed file past the failure line", () => {
    expect(timingResults([timing(15_001)], touched("scripts/example.test.ts")).failures).toEqual([
      "scripts/example.test.ts took 15001 ms, over the 15000 ms limit for a test file this pull request changes",
    ]);
  });

  it("lets the real Workers integration take 30 s without relaxing other files", () => {
    const relay = "relay/worker.test.ts";
    expect(timingResults([timing(30_000, relay)], touched(relay))).toEqual({
      failures: [],
      warnings: [],
    });
    expect(timingResults([timing(30_001, relay)], touched(relay)).failures).toHaveLength(1);
    expect(timingResults([timing(30_001, relay)], touched()).failures).toEqual([]);
    expect(timingResults([timing(25_000, "relay/other.test.ts")], touched()).warnings).toHaveLength(
      1,
    );
  });

  it("fails absent or nonfinite measurements, whatever a pull request changed", () => {
    expect(timingResults([], touched()).failures).toEqual(["Vitest reported no test files"]);
    expect(timingResults([timing(Number.NaN)], touched()).failures).toHaveLength(1);
    expect(timingResults([timing(-1)], touched()).failures).toHaveLength(1);
  });

  it("publishes every file, slowest first, with the wall time & the limits", () => {
    const summary = timingSummary(
      [timing(5000), timing(6000, "slow.test.ts")],
      20_000,
      timingResults([timing(6000, "slow.test.ts")], touched()),
    );
    expect(summary).toContain("Wall time: 20.00 s.");
    expect(summary).toContain("5 s");
    expect(summary).toContain("15 s");
    expect(summary).toContain("slow.test.ts took 6000 ms");
    expect(summary.lastIndexOf("slow.test.ts")).toBeLessThan(
      summary.indexOf("scripts/example.test.ts"),
    );
  });
});

describe("parseTouchedFiles", () => {
  it("reads the change detector's space-separated list", () => {
    expect(parseTouchedFiles("a.test.ts b.test.ts")).toEqual(touched("a.test.ts", "b.test.ts"));
  });

  it("is empty when no pull request changed a test file", () => {
    expect(parseTouchedFiles(undefined)).toEqual(touched());
    expect(parseTouchedFiles("")).toEqual(touched());
    expect(parseTouchedFiles(" ")).toEqual(touched());
  });
});

it("leaves CPU headroom for CLI subprocesses without selecting zero workers", () => {
  expect(vitestArguments(false, 1)).toContain("--maxWorkers=1");
  expect(vitestArguments(false, 2)).toContain("--maxWorkers=1");
  expect(vitestArguments(false, 4)).toContain("--maxWorkers=2");
  expect(vitestArguments(true, 14)).toContain("--maxWorkers=4");
  expect(vitestArguments(true, 14)).toContain("--coverage");
});
