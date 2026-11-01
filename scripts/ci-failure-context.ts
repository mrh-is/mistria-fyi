import "#scripts/lib/require-pinned-node";

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { defaultCommandRunner } from "#scripts/accessibility-monitor";

import type { CommandRunner } from "#scripts/accessibility-monitor";

interface RunJobs {
  jobs: { conclusion: string; name: string }[];
}

interface MainRun {
  conclusion: string;
  databaseId: number;
}

/** A job name match is context for an investigation, never evidence that a PR is safe. */
export async function summarizeFailureContext(options: {
  repository: string;
  run?: CommandRunner;
  runId: string;
}): Promise<string> {
  const { repository, runId } = options;
  const run = options.run ?? defaultCommandRunner;
  try {
    const current = JSON.parse(
      await run("gh", ["run", "view", runId, "--repo", repository, "--json", "jobs"]),
    ) as RunJobs;
    const failures = current.jobs.filter(
      ({ conclusion, name }) => conclusion === "failure" && name !== "CI passed",
    );
    if (failures.length === 0) return "";
    const runs = JSON.parse(
      await run("gh", [
        "run",
        "list",
        "--repo",
        repository,
        "--workflow",
        "ci.yml",
        "--branch",
        "main",
        "--event",
        "push",
        "--status",
        "completed",
        "--limit",
        "100",
        "--json",
        "databaseId,conclusion",
      ]),
    ) as MainRun[];
    // gh lists newest first. Never reach past a green run to find an older matching failure.
    const main = runs.find(({ conclusion }) => conclusion !== "cancelled");
    if (main?.conclusion !== "failure") return "";
    const baseline = JSON.parse(
      await run("gh", [
        "run",
        "view",
        String(main.databaseId),
        "--repo",
        repository,
        "--json",
        "jobs",
      ]),
    ) as RunJobs;
    const failedOnMain = new Set(
      baseline.jobs.filter(({ conclusion }) => conclusion === "failure").map(({ name }) => name),
    );
    const matches = failures.filter(({ name }) => failedOnMain.has(name));
    if (matches.length === 0) return "";
    return [
      "## Shared CI failures",
      "",
      "These jobs are also failing on `main`’s latest completed, non-cancelled push:",
      "",
      ...matches.map(({ name }) => `- ${name.replaceAll(/[\\`*_<>[\]\r\n]/gu, String.raw`\$&`)}`),
      "",
      `[Main’s run](https://github.com/${repository}/actions/runs/${main.databaseId})`,
      "",
      "A matching job name doesn’t establish a shared cause. All check results remain unchanged.",
      "",
    ].join("\n");
  } catch (error) {
    console.warn("Couldn’t compare CI failures with main:", error);
    return "";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Reporting must never interfere with the aggregate result, including when summary writes fail.
  try {
    const summary = await summarizeFailureContext({
      repository: process.env.GITHUB_REPOSITORY ?? "",
      runId: process.env.GITHUB_RUN_ID ?? "",
    });
    if (summary && process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    }
  } catch (error) {
    console.warn("Couldn’t write CI failure context:", error);
  }
}
