import { spawn } from "node:child_process";
import { glob, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MARKER = "<!-- mistria-accessibility-monitor -->";
const TITLE = "Automated accessibility regression detected";

export type CommandRunner = (command: string, args: string[], input?: string) => Promise<string>;

interface IssueSummary {
  body: string;
  number: number;
}

export async function defaultCommandRunner(
  command: string,
  args: string[],
  input?: string,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} exited with status ${code}`));
    });
    child.stdin.end(input);
  });
}

export function summarizePlaywrightReport(report: unknown): string[] {
  const errors: string[] = [];
  collectErrors(report, errors);
  return [...new Set(errors)].slice(0, 10).map((error) => error.slice(0, 2000));
}

export async function synchronizeAccessibilityIssue(options: {
  report?: unknown;
  result: string;
  run?: CommandRunner;
  workflowUrl: string;
}): Promise<void> {
  const run = options.run ?? defaultCommandRunner;
  const issueNumber = await findOpenIssue(run);

  if (options.result === "success") {
    if (issueNumber === undefined) return;
    await run(
      "gh",
      ["issue", "comment", String(issueNumber), "--body-file", "-"],
      [
        "The scheduled accessibility suite has recovered.",
        "",
        `[Workflow run](${options.workflowUrl})`,
        "",
        "Agent: codex",
      ].join("\n"),
    );
    await run("gh", ["issue", "close", String(issueNumber)]);
    return;
  }

  if (options.result !== "failure" || options.report === undefined) {
    throw new Error("Accessibility setup failed without a usable Playwright report");
  }

  const failures = summarizePlaywrightReport(options.report);
  if (failures.length === 0) {
    throw new Error("Playwright failed without an accessibility assertion in its report");
  }
  const body = [
    MARKER,
    "The scheduled browser accessibility suite found a regression.",
    "",
    ...failures.map((failure) => `\`\`\`text\n${failure}\n\`\`\``),
    "",
    `[Workflow run](${options.workflowUrl})`,
    "Artifact: `accessibility-report-*`",
    "Reproduce: `pnpm run test:accessibility`",
    "",
    "Agent: codex",
  ].join("\n");

  const args =
    issueNumber === undefined
      ? [
          "issue",
          "create",
          "--title",
          TITLE,
          "--label",
          "type: bug",
          "--label",
          "status: ready",
          "--label",
          "agent: codex",
          "--body-file",
          "-",
        ]
      : ["issue", "comment", String(issueNumber), "--body-file", "-"];
  await run("gh", args, body);
}

function collectErrors(value: unknown, errors: string[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectErrors(entry, errors);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.includes("Accessibility violations")) {
    errors.push(record.message);
  }
  for (const nested of Object.values(record)) collectErrors(nested, errors);
}

// GitHub search drops the marker's comment punctuation and matches its words anywhere, so the
// query only narrows candidates; the exact marker in the body is what identifies a monitor issue.
async function findOpenIssue(run: CommandRunner): Promise<number | undefined> {
  const output = await run("gh", [
    "issue",
    "list",
    "--state",
    "open",
    "--label",
    "type: bug",
    "--search",
    `"${TITLE}" in:title`,
    "--json",
    "number,body",
  ]);
  const issues = JSON.parse(output) as IssueSummary[];
  return issues.find((issue) => issue.body.includes(MARKER))?.number;
}

async function main(): Promise<void> {
  const result = process.env.ACCESSIBILITY_RESULT ?? "";
  let report: unknown;
  if (result === "failure") {
    const reports: unknown[] = [];
    for await (const path of glob(
      "playwright-shard-reports/*/.playwright-artifacts/results.json",
    )) {
      reports.push(JSON.parse(await readFile(path, "utf8")));
    }
    report = reports;
  }
  await synchronizeAccessibilityIssue({
    report,
    result,
    workflowUrl: process.env.WORKFLOW_URL ?? "",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
