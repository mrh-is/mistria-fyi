import { describe, expect, it } from "vitest";

import {
  budgetFailures,
  cliProbeFiles,
  timingBudgets,
  timingSummary,
  vitestArguments,
  vitestInvocations,
} from "./vitest-timings.js";

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
    expect(timingBudgets(2, false)).toEqual({
      fileMs: 10_000,
      probeFileMs: 10_000,
      stepMs: 120_000,
    });
    expect(timingBudgets(4, false)).toEqual({ fileMs: 5000, probeFileMs: 15_000, stepMs: 90_000 });
    expect(timingBudgets(4, true)).toEqual({
      fileMs: 15_000,
      probeFileMs: 15_000,
      stepMs: 300_000,
    });
    expect(timingBudgets(2, true)).toEqual({
      fileMs: 10_000,
      probeFileMs: 10_000,
      stepMs: 300_000,
    });
  });

  it("gives only the CLI probe files their own file ceiling", () => {
    const probeBudgets = { ...budgets, probeFileMs: 15_000 };
    const probe = { durationMs: 9500, file: cliProbeFiles[1], project: "node" };
    expect(budgetFailures([probe], 10_000, probeBudgets)).toEqual([]);
    expect(budgetFailures([{ ...probe, durationMs: 15_001 }], 10_000, probeBudgets)).toEqual([
      `${cliProbeFiles[1]}: 15001 ms exceeds the 15000 ms file budget`,
    ]);
    expect(
      budgetFailures([{ ...probe, file: "scripts/example.test.ts" }], 10_000, probeBudgets),
    ).toEqual(["scripts/example.test.ts: 9500 ms exceeds the 5000 ms file budget"]);
  });

  it("bounds the real Workers integration separately without relaxing other files", () => {
    const runtimeBudgets = timingBudgets(4, false);
    const relay = { durationMs: 25_000, file: "relay/worker.test.ts", project: "node" };
    expect(budgetFailures([relay], 30_000, runtimeBudgets)).toEqual([]);
    expect(budgetFailures([{ ...relay, durationMs: 30_001 }], 35_000, runtimeBudgets)).toEqual([
      "relay/worker.test.ts: 30001 ms exceeds the 30000 ms file budget",
    ]);
    expect(
      budgetFailures([{ ...relay, file: "relay/other.test.ts" }], 30_000, runtimeBudgets),
    ).toEqual(["relay/other.test.ts: 25000 ms exceeds the 5000 ms file budget"]);
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

it("leaves CPU headroom for CLI subprocesses without selecting zero workers", () => {
  expect(vitestArguments(false, 1)).toContain("--maxWorkers=1");
  expect(vitestArguments(false, 2)).toContain("--maxWorkers=1");
  expect(vitestArguments(false, 4)).toContain("--maxWorkers=2");
  expect(vitestArguments(true, 14)).toContain("--maxWorkers=4");
  expect(vitestArguments(true, 14)).toContain("--coverage");
});

it("reserves headroom only for CLI probes on two-CPU noncoverage runs", () => {
  const [ordinary, probes] = vitestInvocations(false, 2);
  expect(ordinary.arguments).toContain("--maxWorkers=2");
  expect(probes.arguments).toContain("--maxWorkers=1");
  const probeFiles = probes.arguments.filter((argument) => argument.endsWith(".test.ts"));
  expect(probeFiles).toHaveLength(3);
  expect(probeFiles).toEqual(cliProbeFiles);
  expect(ordinary.excludeCliProbes).toBe(true);
  expect(probes.excludeCliProbes).toBe(false);
  expect(ordinary.arguments).not.toContain("--coverage");
  expect(probes.arguments).not.toContain("--coverage");
});

it("keeps nightly coverage in one invocation and preserves other runner classes", () => {
  for (const [cpus, coverage] of [
    [2, true],
    [1, false],
    [4, false],
  ] as const) {
    expect(vitestInvocations(coverage, cpus)).toEqual([
      { arguments: vitestArguments(coverage, cpus), excludeCliProbes: false },
    ]);
  }
});
