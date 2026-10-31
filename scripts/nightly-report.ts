import "#scripts/lib/require-pinned-node";

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { defaultCommandRunner, findMarkedIssue } from "#scripts/accessibility-monitor";
import { fileLimits } from "#scripts/vitest-timings";

import type { CommandRunner } from "#scripts/accessibility-monitor";
import type { FileTiming } from "#scripts/vitest-timings";

const MARKER = "<!-- mistria-nightly-report -->";
const TITLE = "Nightly CI report";
const LABEL = "type: maintenance";

// Pull requests don't fail on wall time, so this line is what catches the suite growing. Main's
// step took 73-119 s, with a median of about 90 s, when this was set (#13).
const WALL_LINE_MS = 120_000;
// One slow runner shouldn't file an issue, so findings compare medians over main's recent pushes,
// for the run as a whole & for each file.
const SAMPLE_RUNS = 10;
const MINIMUM_SAMPLES = 3;
export const TIMING_ARTIFACT = "vitest-timings";

export interface TimingSample {
  elapsedMs: number;
  files: FileTiming[];
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function timingFindings(samples: TimingSample[]): string[] {
  const findings: string[] = [];
  const wallMs = median(samples.map(({ elapsedMs }) => elapsedMs));
  if (wallMs > WALL_LINE_MS) {
    findings.push(
      `The Vitest step's median wall time is ${seconds(wallMs)}, over its ${WALL_LINE_MS / 1000} s line.`,
    );
  }
  const durations = Map.groupBy(
    samples.flatMap(({ files }) => files),
    ({ file }) => file,
  );
  const medians = [...durations]
    .filter(([, timings]) => timings.length >= MINIMUM_SAMPLES)
    .map(([file, timings]) => ({
      file,
      medianMs: median(timings.map(({ durationMs }) => durationMs)),
    }));
  for (const { file, medianMs } of medians.toSorted((a, b) => b.medianMs - a.medianMs)) {
    const { warnMs } = fileLimits(file);
    if (medianMs > warnMs) {
      findings.push(
        `\`${file}\` has a median of ${seconds(medianMs)}, over its ${warnMs / 1000} s line.`,
      );
    }
  }
  return findings;
}

export async function synchronizeNightlyIssue(options: {
  findings: string[];
  run?: CommandRunner;
  workflowUrl: string;
}): Promise<void> {
  const { findings, workflowUrl } = options;
  const run = options.run ?? defaultCommandRunner;
  const issueNumber = await findMarkedIssue(run, { label: LABEL, marker: MARKER, title: TITLE });

  if (findings.length === 0) {
    if (issueNumber === undefined) return;
    await run(
      "gh",
      ["issue", "comment", String(issueNumber), "--body-file", "-"],
      [
        "The nightly report is clear.",
        "",
        `[Workflow run](${workflowUrl})`,
        "",
        "Agent: claude-code",
      ].join("\n"),
    );
    await run("gh", ["issue", "close", String(issueNumber)]);
    return;
  }

  const body = [
    MARKER,
    "None of these fail a pull request. The nightly CI run updates this issue & closes it once they clear.",
    "",
    ...findings.map((finding) => `- ${finding}`),
    "",
    `[Workflow run](${workflowUrl})`,
    "",
    "Agent: claude-code",
  ].join("\n");
  const args =
    issueNumber === undefined
      ? ["issue", "create", "--title", TITLE, "--label", LABEL, "--body-file", "-"]
      : ["issue", "edit", String(issueNumber), "--body-file", "-"];
  await run("gh", args, body);
}

export async function recentSamples(run: CommandRunner): Promise<TimingSample[]> {
  // Only pushes to main: they run the same suite, without the coverage that slows nightly runs.
  // Twice the runs wanted, since a cancelled run has no artifact.
  const listing = await run("gh", [
    "run",
    "list",
    "--workflow=ci.yml",
    "--branch=main",
    "--event=push",
    `--limit=${SAMPLE_RUNS * 2}`,
    "--json=databaseId",
  ]);
  const samples: TimingSample[] = [];
  for (const { databaseId } of JSON.parse(listing) as { databaseId: number }[]) {
    if (samples.length === SAMPLE_RUNS) break;
    const directory = mkdtempSync(join(tmpdir(), "vitest-timings-"));
    try {
      // oxlint-disable-next-line no-await-in-loop -- one at a time, so it stops downloading once it has enough samples
      await run("gh", [
        "run",
        "download",
        String(databaseId),
        `--name=${TIMING_ARTIFACT}`,
        `--dir=${directory}`,
      ]);
      samples.push(
        JSON.parse(readFileSync(join(directory, "timings.json"), "utf8")) as TimingSample,
      );
    } catch (error) {
      console.warn(`Skipping run ${databaseId}: ${String(error)}`);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  }
  return samples;
}

export async function reportNightly(options: {
  run?: CommandRunner;
  workflowUrl: string;
}): Promise<void> {
  const { workflowUrl } = options;
  const run = options.run ?? defaultCommandRunner;
  const samples = await recentSamples(run);
  // Every download failing looks the same as a quiet week otherwise, such as with a missing
  // permission or a renamed artifact, and the report would stop working with a green job.
  if (samples.length === 0) {
    throw new Error("No timing samples: main's recent runs had no readable timing artifact.");
  }
  // Too few runs to trust a median, so this says nothing either way & leaves any open issue alone.
  if (samples.length < MINIMUM_SAMPLES) {
    console.warn(`Only ${samples.length} recent timing samples; skipping the report.`);
    return;
  }
  await synchronizeNightlyIssue({ findings: timingFindings(samples), run, workflowUrl });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await reportNightly({ workflowUrl: process.env.WORKFLOW_URL ?? "" });
}
