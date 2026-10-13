import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { pnpmCommand } from "#scripts/lib/pnpm-command";

export interface HookInput {
  cwd?: string;
  hook_event_name?: string;
  stop_hook_active?: boolean;
  tool_input?:
    | string
    | {
        command?: unknown;
        file_path?: unknown;
        notebook_path?: unknown;
        path?: unknown;
      };
  tool_name?: string;
  tool_use_id?: string;
}

export function readHookInput(): HookInput {
  return JSON.parse(readFileSync(0, "utf8")) as HookInput;
}

/** Resolve existing symlinks, including the parent of a file that hasn't been created yet. */
export function canonicalPath(cwd: string, target: string): string {
  const absolute = resolve(cwd, target);
  if (existsSync(absolute)) {
    return realpathSync(absolute);
  }
  const parent = dirname(absolute);
  return parent === absolute
    ? absolute
    : resolve(canonicalPath(cwd, parent), relative(parent, absolute));
}

/** File tools & the path headers of Codex's patch format; never inspect patch content. */
export function editPaths(input: HookInput): string[] {
  const tool = input.tool_input;
  if (typeof tool === "string" || input.tool_name === "apply_patch") {
    const patch = typeof tool === "string" ? tool : tool?.command;
    return typeof patch === "string"
      ? [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)].map(
          (match) => match[1].trim(),
        )
      : [];
  }
  return [tool?.file_path, tool?.notebook_path, tool?.path].filter(
    (value): value is string => typeof value === "string" && value !== "",
  );
}

export function shellCommand(input: HookInput): string | undefined {
  if (input.tool_name !== "Bash") {
    return undefined;
  }
  const command =
    typeof input.tool_input === "string" ? input.tool_input : input.tool_input?.command;
  return typeof command === "string" ? command : undefined;
}

/** Direct shell path arguments. This is deliberately not an interpreter for arbitrary programs. */
export function shellPaths(command: string): string[] {
  return [...command.matchAll(/"([^"\n]+)"|'([^'\n]+)'|([^\s;|&<>]+)/g)].flatMap((match) => {
    const value = match[1] ?? match[2] ?? match[3];
    return [value];
  });
}

export function isShellWrite(command: string): boolean {
  return /(?:^|[;&|]\s*|\s)(?:tee|cp|mv|rm|touch|install|truncate|apply_patch)\b|(?:^|\s)(?:sed|perl)\s+[^;\n]*-[^\s]*i|(?:^|[^<])>{1,2}[^>]|\b(?:writeFile\w*|write_text|write_bytes)\s*\(/.test(
    command,
  );
}

export function isShellRead(command: string): boolean {
  return /(?:^|[;&|]\s*|\s)(?:cat|head|tail|less|more|bat|jq|sed|awk|rg|grep|cut|wc|sort|diff|cmp)\b|\breadFile\w*\s*\(|\bread_text\s*\(|\bread_bytes\s*\(|(?:^|[^<])<[^<]|\bopen\s*\(/.test(
    command,
  );
}

export interface CommandResult {
  output: string;
  status: number;
}

export type RunCommand = (args: string[], cwd: string) => CommandResult;

export function runPnpm(args: string[], cwd: string): CommandResult {
  const command = pnpmCommand(args);
  const result = spawnSync(command.command, command.args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    shell: command.shell,
  });
  return {
    output: result.error?.message ?? `${result.stdout ?? ""}${result.stderr ?? ""}`,
    status: result.status ?? 1,
  };
}

export function repositoryRoot(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      result.error?.message ?? (result.stderr.trim() || "Could not find repository root"),
    );
  }
  return canonicalPath(cwd, result.stdout.trim());
}

export function repositoryHead(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.error?.message ?? (result.stderr.trim() || "Could not resolve HEAD"));
  }
  return result.stdout.trim();
}

/** Include staged, unstaged, untracked, & committed branch changes, with NUL-safe filenames. */
export function changedFiles(cwd: string, branch: boolean | string = false): string[] {
  const root = repositoryRoot(cwd);
  const queries = [
    ["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ];
  if (branch) {
    queries.push([
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      "-z",
      typeof branch === "string" ? `${branch}..HEAD` : "origin/main...HEAD",
    ]);
  }
  const paths = new Set<string>();
  for (const args of queries) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(
        result.error?.message ?? (result.stderr.trim() || "Could not list changed files"),
      );
    }
    for (const file of result.stdout.split("\0").filter(Boolean)) {
      const absolute = resolve(root, file);
      const rel = relative(root, canonicalPath(root, file));
      if (
        !isAbsolute(rel) &&
        rel !== ".." &&
        !rel.startsWith(`..${sep}`) &&
        existsSync(absolute) &&
        statSync(absolute).isFile()
      ) {
        paths.add(file);
      }
    }
  }
  return [...paths].toSorted();
}

export function contextOutput(event: string, additionalContext: string): string {
  return JSON.stringify({ hookSpecificOutput: { additionalContext, hookEventName: event } });
}
