import "#scripts/lib/require-pinned-node";

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

interface Issue {
  assignees: { login: string }[];
  blockedBy: { nodes: { state: string }[] };
  labels: { name: string }[];
  state: string;
}

interface PullRequest {
  assignees: { login: string }[];
  body: string;
  closingIssuesReferences: { url: string }[];
  state: string;
}

function read(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function run(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: "inherit" });
}

function ghJson(args: string[]): unknown {
  return JSON.parse(read("gh", args));
}

function issueView(number: string): Issue {
  return ghJson(["issue", "view", number, "--json", "state,assignees,labels,blockedBy"]) as Issue;
}

function checkIssue(issue: Issue, takeover: boolean): void {
  const labels = issue.labels.map(({ name }) => name);
  if (
    issue.state !== "OPEN" ||
    issue.blockedBy.nodes.some(({ state }) => state === "OPEN") ||
    labels.includes("status: blocked") ||
    labels.includes("status: needs decision")
  ) {
    throw new Error("Issue is closed, blocked, or awaiting a decision.");
  }
  if (
    !takeover &&
    (issue.assignees.length > 0 ||
      labels.some((label) => label === "status: in progress" || label.startsWith("agent:")))
  ) {
    throw new Error("Issue already has an owner or active label. Coordinate with the human owner.");
  }
}

function claimIssue(number: string, login: string, agent: string, takeover: boolean): void {
  const issue = issueView(number);
  checkIssue(issue, takeover);
  const args = [
    "issue",
    "edit",
    number,
    "--add-assignee",
    login,
    "--add-label",
    "status: in progress",
  ];
  if (agent !== "human") {
    args.push("--add-label", `agent: ${agent}`);
  }
  for (const { name } of issue.labels) {
    if (
      (name.startsWith("status:") && name !== "status: in progress") ||
      (name.startsWith("agent:") && name !== `agent: ${agent}`)
    ) {
      args.push("--remove-label", name);
    }
  }
  for (const assignee of issue.assignees) {
    if (assignee.login !== login) {
      args.push("--remove-assignee", assignee.login);
    }
  }
  run("gh", args);
  const claimed = issueView(number);
  const labels = claimed.labels.map(({ name }) => name);
  const agents = labels.filter((label) => label.startsWith("agent:"));
  if (
    claimed.assignees.length !== 1 ||
    claimed.assignees[0]?.login !== login ||
    labels.filter((label) => label.startsWith("status:")).join(",") !== "status: in progress" ||
    agents.join(",") !== (agent === "human" ? "" : `agent: ${agent}`)
  ) {
    throw new Error(`Issue #${number} claim could not be verified. Check its current state.`);
  }
  console.log(`Claimed #${number} for ${login} (${agent}).`);
}

function checkCurrent(): void {
  const root = realpathSync(read("git", ["rev-parse", "--show-toplevel"]));
  const primary = realpathSync(
    read("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
  );
  if (
    realpathSync(process.cwd()) !== root ||
    primary === realpathSync(read("git", ["rev-parse", "--absolute-git-dir"]))
  ) {
    throw new Error("Run this mode from the root of a dedicated linked worktree.");
  }
  if (read("git", ["status", "--porcelain"])) {
    throw new Error("The worktree has local changes. Resolve them before starting work.");
  }
}

function nodeScript(name: string, args: string[] = []): void {
  run(process.execPath, [fileURLToPath(new URL(name, import.meta.url)), ...args]);
}

function linkedIssue(pr: PullRequest, repositoryUrl: string): string | undefined {
  const issues = new Set<string>();
  for (const { url } of pr.closingIssuesReferences) {
    if (url.startsWith(`${repositoryUrl}/issues/`)) {
      issues.add(url.slice(`${repositoryUrl}/issues/`.length));
    }
  }
  for (const match of pr.body.matchAll(/^\s*(?:Closes|Refs) #([1-9]\d*)\s*$/gim)) {
    if (match[1]) {
      issues.add(match[1]);
    }
  }
  if (issues.size > 1) {
    throw new Error("PR references multiple issues. Coordinate the issue handoff with the owner.");
  }
  return [...issues][0];
}

function setupExisting(): void {
  checkCurrent();
  const branch = read("git", ["branch", "--show-current"]);
  if (!branch || branch === "main") {
    throw new Error("Create or select a task branch in this worktree first.");
  }
  nodeScript("setup-worktree.ts");
}

export function startWork(args: string[]): void {
  const [mode, target = "", detail = "", agent = "", owner, ...extra] = args;
  const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const number = /^[1-9]\d*$/;
  if (mode === "task" && args.length === 2 && (slug.test(target) || target === "--current")) {
    if (target === "--current") {
      setupExisting();
    } else {
      nodeScript("new-worktree.ts", [target]);
    }
    return;
  }
  const issueMode = mode === "issue" && (slug.test(detail) || detail === "--current");
  const prMode = mode === "takeover" && detail === "--current";
  if (
    !(issueMode || prMode) ||
    !number.test(target) ||
    !/^[a-z][a-z0-9-]*$/.test(agent) ||
    extra.length > 0
  ) {
    throw new Error(
      "Usage: start-work task <slug|--current> | issue <number> <slug|--current> <agent|human> [owner] | takeover <PR> --current <agent|human> [owner]",
    );
  }
  let login: string;
  try {
    login = read("gh", ["api", "user", "--jq", ".login"]);
  } catch {
    throw new Error("Could not verify the GitHub login. Ask a human to check GitHub access.");
  }
  if (!login || (owner && login.toLowerCase() !== owner.toLowerCase())) {
    throw new Error(
      "GitHub login does not match the intended owner. Confirm the account with a human.",
    );
  }
  const repositoryUrl = read("gh", ["repo", "view", "--json", "url", "--jq", ".url"]);
  if (agent !== "human") {
    read("gh", [
      "api",
      `repos/${new URL(repositoryUrl).pathname.slice(1)}/labels/${encodeURIComponent(`agent: ${agent}`)}`,
    ]);
  }
  if (issueMode) {
    checkIssue(issueView(target), false);
    if (detail === "--current") {
      setupExisting();
    } else {
      nodeScript("new-worktree.ts", [`${target}-${detail}`]);
    }
    claimIssue(target, login, agent, false);
    return;
  }
  checkCurrent();
  const pr = ghJson([
    "pr",
    "view",
    target,
    "--json",
    "state,body,assignees,closingIssuesReferences",
  ]) as PullRequest;
  if (pr.state !== "OPEN") {
    throw new Error("Takeover requires an open PR.");
  }
  const issue = linkedIssue(pr, repositoryUrl);
  const openIssue = issue && issueView(issue).state === "OPEN" ? issue : undefined;
  if (openIssue) {
    checkIssue(issueView(openIssue), true);
  }
  run("gh", ["pr", "checkout", target]);
  nodeScript("setup-worktree.ts");
  if (openIssue) {
    claimIssue(openIssue, login, agent, true);
  }
  const edit = ["pr", "edit", target, "--add-assignee", login];
  for (const assignee of pr.assignees) {
    if (assignee.login !== login) {
      edit.push("--remove-assignee", assignee.login);
    }
  }
  run("gh", edit);
  const { assignees } = ghJson(["pr", "view", target, "--json", "assignees"]) as Pick<
    PullRequest,
    "assignees"
  >;
  if (assignees.length !== 1 || assignees[0]?.login !== login) {
    throw new Error(`PR #${target} handoff could not be verified. Check its current assignees.`);
  }
  console.log(`PR #${target} ready for ${login} (${agent}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    startWork(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
