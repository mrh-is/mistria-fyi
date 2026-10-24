import "#scripts/lib/require-pinned-node";

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Reporter, TestModule } from "vitest/node";

export interface FileTiming {
  durationMs: number;
  file: string;
  project: string;
}

export interface Budgets {
  fileMs: number;
  // Ceiling for `cliProbeFiles`; falls back to `fileMs` when absent.
  probeFileMs?: number;
  stepMs: number;
}

// Private ubuntu-latest runners have two CPUs; public runners have four. The four-CPU
// ceiling is deliberately tighter. Coverage has a separate nightly wall-time ceiling. The
// two-CPU wall ceiling covers a cold transform cache (105 s) above warm runs (52-79 s, #707).
export function timingBudgets(cpus: number, coverage: boolean): Budgets {
  const stepMs = cpus < 4 ? 120_000 : 90_000;
  // V8 coverage instrumentation slows in-process code, so nightly runs triple the ordinary file
  // ceiling. On one four-CPU commit, coverage slowed files over 200 ms by a median 1.14× & at
  // most 2.61× (tracker-data-schema.test.ts, 2.1 s to 5.2 s, which grows with the tracker data).
  const fileMs = (cpus < 4 ? 10_000 : 5e3) * (coverage ? 3 : 1);
  return {
    fileMs,
    // The CLI probes spawn pnpm, oxlint, & vitest subprocesses, so their time is dominated by
    // process startup rather than the code under test. On four-CPU runners they share workers
    // with the suite & measured 9.1-9.4 s (lint-ownership) & 5.2-5.6 s (vitest-projects) in
    // #13. Two-CPU runners isolate them and keep the ordinary ceiling. Coverage leaves them
    // unchanged (0.98-0.99×), so their ceiling only rises to stay at or above `fileMs`.
    probeFileMs: Math.max(cpus < 4 ? 10_000 : 15_000, fileMs),
    stepMs: coverage ? 300_000 : stepMs,
  };
}

export function vitestArguments(coverage: boolean, cpus: number): string[] {
  return [
    "exec",
    "vitest",
    "run",
    "--project=!assets",
    `--maxWorkers=${Math.max(1, Math.min(Math.floor(cpus / 2), 4))}`,
    "--reporter=default",
    "--reporter=./scripts/vitest-timings.ts",
    ...(coverage ? ["--coverage"] : []),
  ];
}

export const cliProbeFiles = [
  "scripts/playwright-allocation.test.ts",
  "tests/lint-ownership.test.ts",
  "tests/vitest-projects.test.ts",
];

export interface VitestInvocation {
  arguments: string[];
  excludeCliProbes: boolean;
}

export function vitestInvocations(coverage: boolean, cpus: number): VitestInvocation[] {
  const arguments_ = vitestArguments(coverage, cpus);
  if (cpus !== 2 || coverage) return [{ arguments: arguments_, excludeCliProbes: false }];

  // Only the expensive CLI probes need a spare CPU. Serializing every file on a two-CPU
  // runner exceeded the unchanged wall budget on main & #699, twice on the latter.
  return [
    {
      arguments: arguments_.map((argument) =>
        argument === "--maxWorkers=1" ? "--maxWorkers=2" : argument,
      ),
      excludeCliProbes: true,
    },
    { arguments: [...arguments_, ...cliProbeFiles], excludeCliProbes: false },
  ];
}

function fileBudget(file: string, budgets: Budgets): number {
  return cliProbeFiles.includes(file) ? (budgets.probeFileMs ?? budgets.fileMs) : budgets.fileMs;
}

export function budgetFailures(files: FileTiming[], elapsedMs: number, budgets: Budgets): string[] {
  const failures = files
    .filter(
      ({ durationMs, file }) =>
        !Number.isFinite(durationMs) || durationMs < 0 || durationMs > fileBudget(file, budgets),
    )
    .map(
      ({ durationMs, file }) =>
        `${file}: ${durationMs.toFixed(0)} ms exceeds the ${fileBudget(file, budgets)} ms file budget`,
    );
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > budgets.stepMs) {
    failures.push(
      `Vitest step: ${elapsedMs.toFixed(0)} ms exceeds the ${budgets.stepMs} ms wall budget`,
    );
  }
  if (files.length === 0) {
    failures.push("Vitest reported no test files");
  }
  return failures;
}

export function timingSummary(files: FileTiming[], elapsedMs: number, budgets: Budgets): string {
  return [
    "## Vitest timings",
    "",
    `Wall time: ${(elapsedMs / 1000).toFixed(2)} s; budget: ${budgets.stepMs / 1000} s. File budget: ${budgets.fileMs / 1000} s (${(budgets.probeFileMs ?? budgets.fileMs) / 1000} s for CLI probes; tests & hooks). Wall time includes startup, imports, setup, & report generation.`,
    "",
    "| Project | File | Tests & hooks (s) |",
    "| --- | --- | ---: |",
    ...files
      .toSorted((a, b) => b.durationMs - a.durationMs)
      .map(
        ({ durationMs, file, project }) =>
          `| ${project} | ${file} | ${(durationMs / 1000).toFixed(3)} |`,
      ),
    "",
  ].join("\n");
}

const artifactDirectory = resolve(".vitest-artifacts");
const reportPath = resolve(artifactDirectory, "timings.json");

export default class TimingReporter implements Reporter {
  private readonly output = reportPath;

  onTestRunEnd(modules: readonly TestModule[]): void {
    const files: FileTiming[] = modules.map((module) => ({
      durationMs: module.diagnostic().duration,
      file: module.relativeModuleId,
      project: module.project.name,
    }));
    mkdirSync(artifactDirectory, { recursive: true });
    writeFileSync(this.output, JSON.stringify({ files }, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const coverage = process.env.VITEST_COVERAGE === "true";
  const cpus = availableParallelism();
  const budgets = timingBudgets(cpus, coverage);
  mkdirSync(artifactDirectory, { recursive: true });
  const started = performance.now();
  const files: FileTiming[] = [];
  let succeeded = true;
  for (const invocation of vitestInvocations(coverage, cpus)) {
    rmSync(reportPath, { force: true });
    const remainingMs = budgets.stepMs + 5e3 - (performance.now() - started);
    if (remainingMs <= 0) {
      succeeded = false;
      break;
    }
    const result = spawnSync("pnpm", invocation.arguments, {
      env: { ...process.env, VITEST_EXCLUDE_CLI_PROBES: String(invocation.excludeCliProbes) },
      killSignal: "SIGKILL",
      stdio: "inherit",
      timeout: Math.ceil(remainingMs),
    });
    try {
      files.push(
        ...(JSON.parse(readFileSync(reportPath, "utf8")) as { files: FileTiming[] }).files,
      );
    } catch (error) {
      console.error("Missing or invalid Vitest timing report", error);
      succeeded = false;
    }
    if (result.error) console.error(result.error);
    if (result.status !== 0) {
      succeeded = false;
      break;
    }
  }
  const elapsedMs = performance.now() - started;
  writeFileSync(reportPath, JSON.stringify({ budgets, coverage, cpus, elapsedMs, files }, null, 2));
  const summary = timingSummary(files, elapsedMs, budgets);
  writeFileSync(resolve(artifactDirectory, "summary.md"), summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  const failures = budgetFailures(files, elapsedMs, budgets);
  for (const failure of failures) {
    console.error(failure);
  }
  process.exitCode = succeeded && failures.length === 0 ? 0 : 1;
}
