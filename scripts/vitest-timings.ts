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
  // Optional so the nightly report can still read artifacts from before retries were recorded.
  retries?: TestRetry[];
}

export interface TestRetry {
  name: string;
  retryCount: number;
  state: string;
}

export function retryWarnings(files: FileTiming[]): string[] {
  return files.flatMap(({ file, project, retries = [] }) =>
    retries
      .filter(({ state }) => state === "passed")
      .map(
        ({ name, retryCount }) =>
          `Vitest retry: [${project}] ${file} > ${name} passed after ${retryCount} retry.`,
      ),
  );
}

export interface FileLimits {
  // Over this, a pull request that changes the file fails. Vitest's durations vary up to about 2×
  // between runners (5.1-11.4 s for one file in #13), so the line sits well clear of that noise.
  failMs: number;
  // Over this, a run warns. A slow file costs time, not correctness, so this never fails a run.
  warnMs: number;
}

export interface TimingResults {
  failures: string[];
  warnings: string[];
}

// Real workerd eviction waits for in-flight events (5 s), and WebSocket close can wait another
// 10 s. The local relay suite also restarts SQLite storage: measured at 21 s in #132.
export const relayIntegrationFile = "relay/worker.test.ts";
const relayLimits: FileLimits = { failMs: 30_000, warnMs: 30_000 };
const defaultLimits: FileLimits = { failMs: 15_000, warnMs: 5000 };

export function fileLimits(file: string): FileLimits {
  return file === relayIntegrationFile ? relayLimits : defaultLimits;
}

export function vitestArguments(coverage: boolean, cpus: number, filters: string[] = []): string[] {
  return [
    "exec",
    "vitest",
    "run",
    "--project=!assets",
    `--maxWorkers=${Math.max(1, Math.min(Math.floor(cpus / 2), 4))}`,
    "--reporter=default",
    "--reporter=./scripts/vitest-timings.ts",
    ...(coverage ? ["--coverage"] : []),
    ...filters,
  ];
}

/** The change detector's list of test files a pull request changes. Other events have none. */
export function parseTouchedFiles(value: string | undefined): Set<string> {
  return new Set(value?.split(/\s+/u).filter(Boolean));
}

export function timingResults(files: FileTiming[], touched: ReadonlySet<string>): TimingResults {
  const results: TimingResults = { failures: [], warnings: [] };
  if (files.length === 0) results.failures.push("Vitest reported no test files");
  for (const { durationMs, file, retries = [] } of files) {
    const { failMs, warnMs } = fileLimits(file);
    const took = `${file} took ${durationMs.toFixed(0)} ms`;
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      results.failures.push(`${took}, which isn't a valid measurement`);
    } else if (touched.has(file) && durationMs > failMs && retries.length === 0) {
      results.failures.push(
        `${took}, over the ${failMs} ms limit for a test file this pull request changes`,
      );
    } else if (durationMs > warnMs) {
      results.warnings.push(`${took}, over the ${warnMs} ms warning line`);
    }
  }
  return results;
}

export function timingSummary(
  files: FileTiming[],
  elapsedMs: number,
  { failures, warnings }: TimingResults,
): string {
  const { failMs, warnMs } = defaultLimits;
  return [
    "## Vitest timings",
    "",
    `Wall time: ${(elapsedMs / 1000).toFixed(2)} s. A file over ${warnMs / 1000} s warns; a pull request fails if it changes a file over ${failMs / 1000} s (${relayLimits.failMs / 1000} s for ${relayIntegrationFile}). Files with retries only warn on timing. File times cover tests & hooks; wall time also includes startup, imports, setup, & report generation.`,
    "",
    ...[...failures, ...warnings].map((message) => `- ${message}`),
    ...files.flatMap(({ file, project, retries = [] }) =>
      retries.map(
        ({ name, retryCount, state }) =>
          `- Vitest retry: [${project}] ${file} > ${name}: ${retryCount} retry, ended ${state}.`,
      ),
    ),
    ...(failures.length + warnings.length > 0 ? [""] : []),
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
      retries: [...module.children.allTests()].flatMap((test) => {
        const retryCount = test.diagnostic()?.retryCount ?? 0;
        return retryCount > 0
          ? [{ name: test.fullName, retryCount, state: test.result().state }]
          : [];
      }),
    }));
    for (const warning of retryWarnings(files)) {
      // Workflow commands must stay on one line even when a test name contains newlines.
      const escaped = warning
        .replaceAll("%", "%25")
        .replaceAll("\r", "%0D")
        .replaceAll("\n", "%0A");
      console.warn(process.env.CI ? `::warning::${escaped}` : warning);
    }
    mkdirSync(artifactDirectory, { recursive: true });
    writeFileSync(this.output, JSON.stringify({ files }, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const coverage = process.env.VITEST_COVERAGE === "true";
  const cpus = availableParallelism();
  mkdirSync(artifactDirectory, { recursive: true });
  rmSync(reportPath, { force: true });
  const started = performance.now();
  const result = spawnSync("pnpm", vitestArguments(coverage, cpus, process.argv.slice(2)), {
    stdio: "inherit",
  });
  const elapsedMs = performance.now() - started;
  if (result.error) console.error(result.error);
  let succeeded = result.status === 0;
  let files: FileTiming[] = [];
  try {
    files = (JSON.parse(readFileSync(reportPath, "utf8")) as { files: FileTiming[] }).files;
  } catch (error) {
    console.error("Missing or invalid Vitest timing report", error);
    succeeded = false;
  }
  writeFileSync(reportPath, JSON.stringify({ coverage, cpus, elapsedMs, files }, null, 2));
  const results = timingResults(files, parseTouchedFiles(process.env.VITEST_TOUCHED_TEST_FILES));
  const summary = timingSummary(files, elapsedMs, results);
  writeFileSync(resolve(artifactDirectory, "summary.md"), summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  for (const warning of results.warnings) {
    console.warn(process.env.GITHUB_ACTIONS === "true" ? `::warning::${warning}` : warning);
  }
  for (const failure of results.failures) {
    console.error(failure);
  }
  process.exitCode = succeeded && results.failures.length === 0 ? 0 : 1;
}
