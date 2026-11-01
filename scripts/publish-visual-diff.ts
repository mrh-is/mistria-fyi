import "#scripts/lib/require-pinned-node";

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

interface Run {
  conclusion: string;
  created_at: string;
  event: string;
  head_sha: string;
  html_url: string;
  id: number;
  path: string;
  pull_requests: { number: number }[];
  repository: { full_name: string };
  updated_at: string;
}

interface PullRequest {
  base: { sha: string };
  head: { sha: string };
  number: number;
  state: string;
}

type Gh = (args: string[]) => Promise<string> | string;

interface Comment {
  body: string;
  id: number;
  user: { id: number };
}

const MARKER = "<!-- visual-diff-pilot -->";

/** Every marked report on the PR, oldest first, whoever wrote it. */
async function markedComments(gh: Gh, repository: string, number: number): Promise<Comment[]> {
  const pages = JSON.parse(
    await gh([
      "api",
      "--paginate",
      "--slurp",
      `repos/${repository}/issues/${number}/comments?per_page=100`,
    ]),
  ) as Comment[][];
  return pages.flat().filter((comment) => comment.body.startsWith(MARKER));
}

/**
 * Upload first, then replace our oldest report with its rewritten attachment URLs. Any other
 * report by the same author, such as one left by an interrupted run, is removed too.
 */
async function keepOneReport(
  gh: Gh,
  repository: string,
  number: number,
  url: string,
  temporary: string,
): Promise<void> {
  const parsed = new URL(url.trim());
  const match = /^#issuecomment-(\d+)$/.exec(parsed.hash);
  if (
    parsed.origin !== "https://github.com" ||
    parsed.pathname !== `/${repository}/pull/${number}` ||
    !match
  ) {
    throw new Error("Unexpected visual comment URL");
  }
  const created = JSON.parse(
    await gh(["api", `repos/${repository}/issues/comments/${match[1]}`]),
  ) as Comment;
  const marked = await markedComments(gh, repository, number);
  const own = marked.filter(
    (comment) => comment.id !== created.id && comment.user.id === created.user.id,
  );
  const [previous, ...orphans] = own;
  if (!previous) return;
  if (
    own.some((comment) => !Number.isSafeInteger(comment.id)) ||
    !Number.isSafeInteger(created.id) ||
    !created.body.startsWith(MARKER)
  ) {
    throw new Error("Invalid managed visual comment");
  }
  const file = join(temporary, "update.json");
  writeFileSync(file, JSON.stringify({ body: created.body }));
  await gh([
    "api",
    "--method",
    "PATCH",
    `repos/${repository}/issues/comments/${previous.id}`,
    "--input",
    file,
  ]);
  // The stable comment now contains the uploaded images. Remove only our own duplicates.
  await Promise.all(
    [...orphans, created].map(async (comment) => {
      await gh(["api", "--method", "DELETE", `repos/${repository}/issues/comments/${comment.id}`]);
    }),
  );
}

/** Artifact text is never executed or copied into Markdown. Only bounded numeric metrics survive. */
export function validatedMetrics(
  value: unknown,
): { changedPixels: null | number; id: string; noisePixels: null | number }[] {
  if (!Array.isArray(value) || value.length !== 8) throw new Error("Expected eight visual states");
  const expected = new Map<string, number>(
    ["home", "almanac"].flatMap((route) =>
      ["light", "dark"].flatMap((theme) =>
        [1280, 390].map((width) => [`${route}-${theme}-${width}`, width * 720] as const),
      ),
    ),
  );
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || !("id" in entry) || typeof entry.id !== "string") {
      throw new Error("Invalid visual state");
    }
    const limit = expected.get(entry.id);
    if (!limit) throw new Error("Unknown or repeated visual state");
    const maximum: number = limit;
    expected.delete(entry.id);
    function metric(key: "changedPixels" | "noisePixels"): null | number {
      const number: unknown = (entry as Record<string, unknown>)[key];
      if (
        number === null ||
        (typeof number === "number" && Number.isInteger(number) && number >= 0 && number <= maximum)
      ) {
        return number;
      }
      throw new Error("Invalid visual pixel count");
    }
    return {
      changedPixels: metric("changedPixels"),
      id: entry.id,
      noisePixels: metric("noisePixels"),
    };
  });
}

/** Only six fixed, regular PNG files can be attached; artifact paths never become CLI options. */
export function reportImages(directory: string): string[] {
  return ["home", "almanac"].flatMap((route) =>
    ["before", "after", "difference"].flatMap((kind) => {
      const path = join(directory, `${route}-${kind}.png`);
      if (!existsSync(path)) return [];
      const stat = lstatSync(path);
      if (
        !stat.isFile() ||
        stat.size > 5 * 1024 * 1024 ||
        stat.size < 8 ||
        !readFileSync(path)
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ) {
        throw new Error("Invalid visual attachment");
      }
      return [path];
    }),
  );
}

export async function publishVisualDiff(options: {
  directory: string;
  gh?: Gh;
  repository: string;
  runId: string;
}): Promise<boolean> {
  const { directory, repository, runId } = options;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^\d+$/.test(runId)) {
    throw new Error("Invalid repository or run ID");
  }
  const gh: Gh =
    options.gh ??
    ((args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }));
  const run = JSON.parse(await gh(["api", `repos/${repository}/actions/runs/${runId}`])) as Run;
  if (
    run.event !== "pull_request" ||
    run.path !== ".github/workflows/visual-diff.yml" ||
    run.repository.full_name !== repository ||
    run.id !== Number(runId) ||
    !/^[a-f\d]{40}$/.test(run.head_sha)
  ) {
    throw new Error("Unexpected visual workflow run");
  }
  // Fork workflow_run payloads can omit pull_requests; resolve from the API in that case.
  const candidates =
    run.pull_requests.length > 0
      ? run.pull_requests
      : (JSON.parse(await gh(["api", `repos/${repository}/commits/${run.head_sha}/pulls`])) as {
          number: number;
        }[]);
  const prs = await Promise.all(
    candidates.map(async (candidate) => {
      if (!Number.isSafeInteger(candidate.number) || candidate.number <= 0) {
        throw new Error("Invalid PR number");
      }
      const pr = JSON.parse(
        await gh(["api", `repos/${repository}/pulls/${candidate.number}`]),
      ) as PullRequest;
      return pr;
    }),
  );
  const pr = prs.find((entry) => entry.state === "open" && entry.head.sha === run.head_sha);
  if (!pr) return false;
  const candidate = { number: pr.number };
  // Refuse a stale run before touching the PR. Re-read immediately before posting too.
  const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
  const report = join(directory, "visual", "report");
  let metrics: ReturnType<typeof validatedMetrics>;
  let images: string[];
  let unavailable: boolean;
  let baseSha: string;
  try {
    for (const path of [directory, join(directory, "visual"), report]) {
      if (!lstatSync(path).isDirectory()) throw new Error("Invalid visual report directory");
    }
    const metricsPath = join(report, "metrics.json");
    if (!lstatSync(metricsPath).isFile() || lstatSync(metricsPath).size > 16_384) {
      throw new Error("Invalid visual metrics file");
    }
    const sourcePath = join(report, "source.json");
    if (!lstatSync(sourcePath).isFile() || lstatSync(sourcePath).size > 1024) {
      throw new Error("Invalid capture source file");
    }
    const source = JSON.parse(readFileSync(sourcePath, "utf8")) as {
      baseSha: string;
      headSha: string;
    };
    if (!/^[a-f\d]{40}$/.test(source.baseSha) || source.headSha !== run.head_sha) {
      throw new Error("Invalid capture source");
    }
    baseSha = source.baseSha;
    metrics = validatedMetrics(JSON.parse(readFileSync(metricsPath, "utf8")));
    images = reportImages(report);
    // Sheets hold placeholders for failed captures, so a complete set can still be incomplete.
    unavailable =
      images.length !== 6 ||
      metrics.some((entry) => entry.changedPixels === null || entry.noisePixels === null);
  } catch {
    unavailable = true;
    images = [];
    metrics = [];
    baseSha = "unavailable";
  }
  const elapsed = Math.round((Date.parse(run.updated_at) - Date.parse(run.created_at)) / 1000);
  const reportBody = (attached: string[], uploadFailed: boolean) =>
    [
      MARKER,
      "## Visual-diff pilot",
      "",
      `Commit: ${run.head_sha}. [Capture run & downloadable report](${runUrl}).`,
      "",
      `Baseline: ${baseSha}, from the PR’s base commit at capture time.`,
      "",
      `CI elapsed time, including setup & queueing: ${Number.isFinite(elapsed) && elapsed >= 0 ? `${elapsed} seconds` : "unavailable"}.`,
      "",
      `Capture workflow: ${["success", "failure", "cancelled", "timed_out"].includes(run.conclusion) ? run.conclusion : "incomplete"}. This pilot does not gate “CI passed”.`,
      "",
      unavailable
        ? "The report or some captures are unavailable. Inspect the capture run for the setup or capture failure."
        : "Each sheet shows desktop & mobile columns, with light & dark rows. Magenta marks changed pixels.",
      "",
      "| State | Changed pixels | Repeat noise (pixels) |",
      "| --- | ---: | ---: |",
      ...metrics.map(
        (entry) =>
          `| ${entry.id} | ${entry.changedPixels ?? "Capture failed"} | ${entry.noisePixels ?? "Capture failed"} |`,
      ),
      "",
      ...(uploadFailed
        ? ["The sheets couldn’t be attached. Download them from the capture run’s report.", ""]
        : []),
      ...attached.flatMap((path) => {
        const caption = basename(path, ".png")
          .replace(/^home-/, "Home, ")
          .replace(/^almanac-/, "Almanac, ");
        return [`### ${caption}`, "", `![${caption}](${path})`, ""];
      }),
      "Existing accessibility checks & manual interaction verification remain required.",
      "",
    ].join("\n");
  const temporary = mkdtempSync(join(tmpdir(), "visual-comment-"));
  try {
    const file = join(temporary, "body.md");
    const current = JSON.parse(
      await gh(["api", `repos/${repository}/pulls/${candidate.number}`]),
    ) as PullRequest;
    if (current.state !== "open" || current.head.sha !== run.head_sha) return false;
    const comment = (attached: string[], uploadFailed: boolean) => {
      writeFileSync(file, reportBody(attached, uploadFailed));
      return gh([
        "pr",
        "comment",
        String(candidate.number),
        "--repo",
        repository,
        "--body-file",
        file,
        ...attached.flatMap((path) => ["--attach", path]),
      ]);
    };
    const before = await markedComments(gh, repository, candidate.number);
    const existing = new Set(before.map((entry) => entry.id));
    let posted: string;
    try {
      posted = await comment(images, false);
    } catch (error) {
      // A failed command may still have created the comment; adopt it instead of posting twice.
      const after = await markedComments(gh, repository, candidate.number);
      const landed = after.find(
        (entry) => !existing.has(entry.id) && entry.body.includes(`Commit: ${run.head_sha}.`),
      );
      if (landed) {
        posted = `https://github.com/${repository}/pull/${candidate.number}#issuecomment-${landed.id}`;
      } else {
        // The job token’s attachment upload is unproven, so a rejected upload still reports metrics.
        if (images.length === 0) throw error;
        const latest = JSON.parse(
          await gh(["api", `repos/${repository}/pulls/${candidate.number}`]),
        ) as PullRequest;
        if (latest.state !== "open" || latest.head.sha !== run.head_sha) return false;
        posted = await comment([], true);
      }
    }
    await keepOneReport(gh, repository, candidate.number, posted, temporary);
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await publishVisualDiff({
    directory: process.env.VISUAL_ARTIFACT_DIRECTORY ?? ".playwright-artifacts/visual-download",
    repository: process.env.GITHUB_REPOSITORY ?? "",
    runId: process.env.VISUAL_RUN_ID ?? "",
  });
}
