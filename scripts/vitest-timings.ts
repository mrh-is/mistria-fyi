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
  stepMs: number;
}

// Private ubuntu-latest runners have two CPUs; public runners have four. The four-CPU
// ceiling is deliberately tighter. Coverage has a separate nightly wall-time ceiling.
export function timingBudgets(cpus: number, coverage: boolean): Budgets {
  const stepMs = cpus < 4 ? 180_000 : 90_000;
  return {
    fileMs: cpus < 4 ? 10_000 : 5e3,
    stepMs: coverage ? 300_000 : stepMs,
  };
}

export function vitestArguments(coverage: boolean, cpus: number): string[] {
  return [
    "exec",
    "vitest",
    "run",
    "--project=!assets",
    `--maxWorkers=${Math.min(cpus, 4)}`,
    "--reporter=default",
    "--reporter=./scripts/vitest-timings.ts",
    ...(coverage ? ["--coverage"] : []),
  ];
}

export function budgetFailures(files: FileTiming[], elapsedMs: number, budgets: Budgets): string[] {
  const failures = files
    .filter(
      ({ durationMs }) =>
        !Number.isFinite(durationMs) || durationMs < 0 || durationMs > budgets.fileMs,
    )
    .map(
      ({ durationMs, file }) =>
        `${file}: ${durationMs.toFixed(0)} ms exceeds the ${budgets.fileMs} ms file budget`,
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
    `Wall time: ${(elapsedMs / 1000).toFixed(2)} s; budget: ${budgets.stepMs / 1000} s. File budget: ${budgets.fileMs / 1000} s (tests & hooks). Wall time includes startup, imports, setup, & report generation.`,
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
  rmSync(reportPath, { force: true });
  const started = performance.now();
  const result = spawnSync("pnpm", vitestArguments(coverage, cpus), {
    killSignal: "SIGKILL",
    stdio: "inherit",
    timeout: budgets.stepMs + 5e3,
  });
  const elapsedMs = performance.now() - started;
  let files: FileTiming[] = [];
  try {
    files = (JSON.parse(readFileSync(reportPath, "utf8")) as { files: FileTiming[] }).files;
  } catch (error) {
    console.error("Missing or invalid Vitest timing report", error);
  }
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
  if (result.error) {
    console.error(result.error);
  }
  process.exitCode = result.status === 0 && failures.length === 0 ? 0 : 1;
}
