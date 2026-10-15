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

const API_WRITE = /\b(?:writeFile\w*|write_text|write_bytes)\s*\(/;

export function isShellWrite(command: string): boolean {
  return (
    /(?:^|[;&|]\s*|\s)(?:tee|cp|mv|rm|touch|install|truncate|apply_patch)\b|(?:^|\s)(?:sed|perl)\s+[^;\n]*-[^\s]*i|(?:^|[^<])>{1,2}[^>]/.test(
      command,
    ) || API_WRITE.test(command)
  );
}

interface ShellSegment {
  command: string;
  heredoc: string;
}

/**
 * Split a shell command at unquoted `;`, `&`, `&&`, `|`, `||`, & newlines. Heredoc bodies stay
 * with the segment that opened them, apart from its command text, so their content is never parsed
 * as commands.
 */
function shellSegments(command: string): ShellSegment[] {
  const segments: ShellSegment[] = [];
  let current: ShellSegment = { command: "", heredoc: "" };
  let pending: { delimiter: string; tabs: boolean }[] = [];
  let quote: string | undefined;
  const flush = () => {
    if (current.command.trim() !== "" || current.heredoc !== "") {
      segments.push(current);
    }
    current = { command: "", heredoc: "" };
  };
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (quote !== undefined) {
      current.command += char;
      if (char === "\\" && quote === '"') {
        current.command += command[++index] ?? "";
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === "\\") {
      current.command += char + (command[++index] ?? "");
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current.command += char;
      continue;
    }
    const heredoc =
      command[index - 1] === "<"
        ? null
        : /^<<(?!<)(-?)\s*(['"]?)([\w.-]+)\2/.exec(command.slice(index));
    if (heredoc) {
      pending.push({ delimiter: heredoc[3], tabs: heredoc[1] === "-" });
      current.command += heredoc[0];
      index += heredoc[0].length - 1;
      continue;
    }
    if (char === "\n" && pending.length > 0) {
      let lineStart = index + 1;
      for (const { delimiter, tabs } of pending) {
        while (lineStart <= command.length) {
          const lineEnd = command.indexOf("\n", lineStart);
          const end = lineEnd === -1 ? command.length : lineEnd;
          const line = command.slice(lineStart, end);
          lineStart = end + 1;
          if ((tabs ? line.replace(/^\t+/, "") : line) === delimiter) {
            break;
          }
          current.heredoc += `${line}\n`;
        }
      }
      pending = [];
      index = lineStart - 2;
      flush();
      continue;
    }
    if (char === ";" || char === "&" || char === "|" || char === "\n") {
      const previous = command[index - 1];
      const redirect =
        (char === "&" && (previous === ">" || previous === "<" || command[index + 1] === ">")) ||
        (char === "|" && previous === ">");
      if (redirect) {
        current.command += char;
        continue;
      }
      flush();
      continue;
    }
    current.command += char;
  }
  flush();
  return segments;
}

const REDIRECT = /(?<![<>])\d*&?>{1,2}\|?\s*("[^"\n]+"|'[^'\n]+'|[^\s;|&<>]+)/g;

/**
 * The paths each segment of a shell command may write: redirect targets, the arguments of writing
 * commands (only the destination for `cp` & `install`), & every path in a heredoc that calls a
 * file-writing API. Reads in other segments, or on the read side of a redirect, are ignored.
 */
export function shellWriteTargets(command: string): string[] {
  return shellSegments(command).flatMap(({ command: segment, heredoc }) => {
    const targets = [...segment.matchAll(REDIRECT)].flatMap((match) => shellPaths(match[1]));
    const rest = segment.replaceAll(/\d*[<>]&\d*-?/g, " ").replaceAll(REDIRECT, " ");
    if (isShellWrite(rest)) {
      const paths = shellPaths(rest);
      targets.push(...(/^\s*(?:\w+=\S*\s+)*(?:cp|install)\b/.test(rest) ? paths.slice(-1) : paths));
    }
    if (API_WRITE.test(heredoc)) {
      targets.push(
        ...shellPaths(heredoc),
        ...[...heredoc.matchAll(/"([^"\n]+)"|'([^'\n]+)'/g)].map((match) => match[1] ?? match[2]),
      );
    }
    return targets;
  });
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
