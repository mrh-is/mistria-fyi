import "#scripts/lib/require-pinned-node";

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { enumerateTests } from "./playwright-allocation.js";

import type { AllocationWeights } from "./playwright-allocation.js";

const WEIGHTS_FILE = "tests/accessibility/duration-weights.json";

interface TimedSuite {
  specs?: {
    file: string;
    tests: { projectName: string; results: { duration: number; status: string }[] }[];
    title: string;
  }[];
  suites?: TimedSuite[];
  title: string;
}

export interface TimedReport {
  config?: { metadata?: { actualWorkers?: number }; version?: string };
  suites: TimedSuite[];
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The median passing duration of every listed test. Retries & tests no longer listed don't count. */
export function buildWeights(reports: TimedReport[], inventory: string[]): AllocationWeights {
  const samples = new Map<string, number[]>(inventory.map((test) => [test, []]));
  function visit(suite: TimedSuite, parents: string[]): void {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const selector = `[${test.projectName}] › ${[spec.file, ...parents, spec.title].join(" › ")}`;
        const passed = test.results.find((result) => result.status === "passed");
        if (passed !== undefined) samples.get(selector)?.push(passed.duration);
      }
    }
    for (const child of suite.suites ?? []) visit(child, [...parents, child.title]);
  }
  for (const report of reports) for (const suite of report.suites) visit(suite, []);
  const tests: Record<string, number> = {};
  for (const test of inventory.toSorted((a, b) => a.localeCompare(b, "en"))) {
    const durations = samples.get(test) ?? [];
    if (durations.length === 0) throw new Error(`No passing CI sample for ${test}`);
    tests[test] = Math.max(1, Math.round(median(durations)));
  }
  return { defaultDurationMs: Math.round(median(Object.values(tests))), tests };
}

function main(): void {
  const runIds = process.argv.slice(2);
  if (runIds.length === 0) throw new Error("Pass the CI run IDs to measure");
  const inventory = enumerateTests(
    JSON.parse(
      execFileSync("pnpm", ["exec", "playwright", "test", "--list", "--reporter=json"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }),
    ) as Parameters<typeof enumerateTests>[0],
  );
  const directory = mkdtempSync(join(tmpdir(), "mistria-weights-"));
  try {
    const reports: TimedReport[] = [];
    for (const runId of runIds) {
      const target = join(directory, runId);
      execFileSync("gh", [
        "run",
        "download",
        runId,
        "--pattern",
        "accessibility-timings-*",
        "--dir",
        target,
      ]);
      for (const artifact of readdirSync(target)) {
        reports.push(
          JSON.parse(readFileSync(join(target, artifact, "results.json"), "utf8")) as TimedReport,
        );
      }
    }
    const weights = buildWeights(reports, inventory);
    const source = {
      jobs: reports.length,
      playwright: [...new Set(reports.map((report) => report.config?.version))],
      refresh: "docs/accessibility-testing.md#duration-weights",
      runIds: runIds.map(Number),
      runner: "ubuntu-latest",
      statistic: "Median passing per-test duration in milliseconds; retries excluded",
      workers: [...new Set(reports.map((report) => report.config?.metadata?.actualWorkers))],
    };
    writeFileSync(
      WEIGHTS_FILE,
      `${JSON.stringify({ defaultDurationMs: weights.defaultDurationMs, source, tests: weights.tests }, null, 2)}\n`,
    );
    console.log(`Measured ${inventory.length} tests from ${reports.length} CI jobs`);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
