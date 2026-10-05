import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Enforces AGENTS.md §2 agent attribution.
 *
 * Rules, applied to the PR's own commits only (history is never checked):
 *
 * - A `Co-Authored-By` trailer for an agent address must use the canonical product-level name, so
 *   `Claude Opus 5.5 <noreply@anthropic.com>` fails but `Claude Code <noreply@anthropic.com>` passes.
 *   Trailers for humans & unlisted agents are ignored.
 * - A PR is agent-authored when it carries an `agent:*` label, has an `Agent:` line, or has a
 *   canonical agent trailer on a commit. An agent-authored PR must end its body with an
 *   `Agent: <slug>` line & carry exactly one `agent:*` label, matching the slug for known agents.
 * - A PR with none of those signals (human-only) passes with no trailer, line, or label.
 * - No PR body may carry the harness's "Generated with Claude Code" footer.
 */

export const CANONICAL_AGENTS = [
  {
    email: "noreply@anthropic.com",
    label: "agent: claude",
    name: "Claude Code",
    slug: "claude-code",
  },
  { email: "codex@openai.com", label: "agent: codex", name: "Codex", slug: "codex" },
];

export interface Commit {
  message: string;
  parents?: number;
  sha?: string;
}

export interface PullRequest {
  body: string;
  commits: Commit[];
  labels: string[];
}

const TRAILER = /^co-authored-by:\s*(.*?)\s*<([^>]*)>\s*$/gim;
const AGENT_LINE = /^Agent:\s*(\S+)\s*$/;

/** Problems with one commit message's agent trailers; also reports whether it has a canonical one. */
export function checkCommitMessage(message: string): { agent: boolean; problems: string[] } {
  const problems: string[] = [];
  let agent = false;
  for (const [, name, email] of message.matchAll(TRAILER)) {
    const known = CANONICAL_AGENTS.find((candidate) => candidate.email === email.toLowerCase());
    if (known === undefined) {
      continue;
    }
    if (name === known.name) {
      agent = true;
    } else {
      problems.push(`Co-Authored-By "${name} <${email}>" must read "${known.name} <${email}>".`);
    }
  }
  return { agent, problems };
}

export function checkPullRequest({ body, commits, labels }: PullRequest): string[] {
  const problems: string[] = [];
  let trailerAgent = false;
  for (const commit of commits) {
    if ((commit.parents ?? 1) > 1) {
      continue;
    }
    const result = checkCommitMessage(commit.message);
    trailerAgent ||= result.agent;
    const title = commit.message.split("\n")[0];
    problems.push(
      ...result.problems.map((problem) => `${commit.sha?.slice(0, 8) ?? ""} ${title}: ${problem}`),
    );
  }

  if (/generated with \[?claude code\]?/i.test(body)) {
    problems.push(
      'The PR body has the "Generated with Claude Code" footer; end it with "Agent: claude-code" instead.',
    );
  }

  const bodyLines = body.split(/\r?\n/).map((line) => line.trimEnd());
  const lastLine = bodyLines.findLast((line) => line !== "") ?? "";
  const agentLines = bodyLines.filter((line) => AGENT_LINE.test(line));
  const agentLabels = labels.filter((label) => /^agent:/i.test(label));

  if (!trailerAgent && agentLines.length === 0 && agentLabels.length === 0) {
    return problems;
  }

  const slug = AGENT_LINE.exec(lastLine)?.[1];
  if (slug === undefined) {
    problems.push('An agent-authored PR body must end with an "Agent: <agent-id>" line.');
  }
  if (agentLabels.length !== 1) {
    problems.push(
      `An agent-authored PR needs exactly one "agent:*" label; found ${agentLabels.length}.`,
    );
  }
  const known = CANONICAL_AGENTS.find((candidate) => candidate.slug === slug);
  if (known !== undefined && agentLabels.length === 1 && agentLabels[0] !== known.label) {
    problems.push(`"Agent: ${slug}" needs the "${known.label}" label, not "${agentLabels[0]}".`);
  }
  return problems;
}

function report(problems: string[]): void {
  for (const problem of problems) {
    console.error(`::error::${problem}`);
  }
  process.exitCode = problems.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, path] = process.argv.slice(2);
  if (mode === "--commit-msg" && path !== undefined) {
    // Local commit-msg hook: only the trailer rule applies before a PR exists.
    report(checkCommitMessage(readFileSync(path, "utf8")).problems);
  } else {
    // CI: PR_BODY & PR_LABELS (JSON array) from the event, PR_COMMITS as one JSON object per line.
    report(
      checkPullRequest({
        body: process.env.PR_BODY ?? "",
        commits: (process.env.PR_COMMITS ?? "")
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => JSON.parse(line) as Commit),
        labels: JSON.parse(process.env.PR_LABELS ?? "[]") as string[],
      }),
    );
  }
}
