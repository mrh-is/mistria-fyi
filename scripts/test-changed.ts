import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { pnpmCommand } from "#scripts/lib/pnpm-command";

const DEFAULT_BASE_REF = "origin/main";
const FULL_SUITE_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "svelte.config.js",
  "tsconfig.json",
  "vite.config.ts",
]);

export interface GitResult {
  status: null | number;
  stderr: string;
  stdout: string;
}

export type ChangedTestPlan =
  | { baseRef: string; changedFiles: string[]; mode: "changed" | "none" }
  | { mode: "full"; reason: string };

type RunGit = (args: string[]) => GitResult;

export function parseBaseRef(args: string[]): string {
  const [first, second] = args;
  return (first === "--" ? second : first) ?? DEFAULT_BASE_REF;
}

export function planChangedTestRun(
  baseRef: string,
  runGit: RunGit = runGitCommand,
): ChangedTestPlan {
  const resolvedBase = runGit(["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]);
  if (resolvedBase.status !== 0) {
    return { mode: "full", reason: `Git could not resolve ${baseRef} to a commit.` };
  }

  const queries = [
    ["diff", "--name-only", `${baseRef}...HEAD`],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--other", "--modified", "--exclude-standard"],
  ];
  const changedFiles = new Set<string>();

  for (const query of queries) {
    const result = runGit(query);
    if (result.status !== 0) {
      const detail =
        result.stderr.trim() || `git ${query[0]} exited with status ${String(result.status)}`;
      return {
        mode: "full",
        reason: `Git could not enumerate files changed from ${baseRef}: ${detail}`,
      };
    }
    for (const file of result.stdout.split("\n")) {
      if (file) {
        changedFiles.add(file);
      }
    }
  }

  const sortedFiles = [...changedFiles].toSorted();
  if (sortedFiles.length === 0) {
    return { baseRef, changedFiles: [], mode: "none" };
  }

  const fullSuiteFile = sortedFiles.find((file) => needsFullSuite(file));
  if (fullSuiteFile) {
    return {
      mode: "full",
      reason: `${fullSuiteFile} can affect test discovery or every test project.`,
    };
  }

  return { baseRef, changedFiles: sortedFiles, mode: "changed" };
}

function needsFullSuite(file: string): boolean {
  return FULL_SUITE_FILES.has(file) || file.startsWith("src/vitest-setup");
}

function runGitCommand(args: string[]): GitResult {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return {
    status: result.status,
    stderr: result.stderr.length > 0 ? result.stderr : (result.error?.message ?? ""),
    stdout: result.stdout ?? "",
  };
}

function runPnpm(pnpmArgs: string[]): number {
  const { args, command, shell } = pnpmCommand(pnpmArgs);
  const result = spawnSync(command, args, { shell, stdio: "inherit" });
  if (result.error) {
    console.error(`Could not start pnpm: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseRef = parseBaseRef(process.argv.slice(2));
  const plan = planChangedTestRun(baseRef);

  if (plan.mode === "full") {
    console.warn(`${plan.reason} Running the complete asset-independent test suite instead.`);
    process.exitCode = runPnpm(["run", "test"]);
  } else if (plan.mode === "none") {
    console.log(`No files changed relative to ${plan.baseRef}; no tests need to run.`);
  } else {
    console.log(
      `Running tests affected by ${plan.changedFiles.length} file(s) relative to ${plan.baseRef}.`,
    );
    process.exitCode = runPnpm([
      "exec",
      "vitest",
      "run",
      "--project=!assets",
      "--changed",
      plan.baseRef,
    ]);
  }
}
