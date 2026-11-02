import { spawn } from "node:child_process";

export type CommandRunner = (
  command: string,
  args: string[],
  input?: string,
  acceptedExitCodes?: readonly number[],
) => Promise<string>;

export interface IssueSummary {
  body: string;
  number: number;
}

export async function defaultCommandRunner(
  command: string,
  args: string[],
  input?: string,
  acceptedExitCodes: readonly number[] = [0],
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== null && acceptedExitCodes.includes(code)) resolve(output);
      else reject(new Error(`${command} exited with status ${code}`));
    });
    child.stdin.end(input);
  });
}

// GitHub search drops the marker's comment punctuation and matches its words anywhere, so the
// query only narrows candidates; the exact marker in the body is what identifies a report issue.
export async function findMarkedIssue(
  run: CommandRunner,
  { label, marker, title }: { label: string; marker: string; title: string },
): Promise<IssueSummary | undefined> {
  const output = await run("gh", [
    "issue",
    "list",
    "--state",
    "open",
    "--label",
    label,
    "--search",
    `"${title}" in:title`,
    "--json",
    "number,body",
  ]);
  const issues = JSON.parse(output) as IssueSummary[];
  return issues.find((issue) => issue.body.includes(marker));
}
