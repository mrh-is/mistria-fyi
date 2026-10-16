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
    /(?:^|[;&|(`{]\s*|\s)(?:tee|cp|mv|rm|touch|install|truncate|apply_patch)\b|(?:^|\s)(?:sed|perl)\s+[^;\n]*-[^\s]*i|(?:^|[^<])>{1,2}[^>]/.test(
      command,
    ) || API_WRITE.test(command)
  );
}

interface ShellSegment {
  command: string;
  heredoc: string;
}

/**
 * Split a shell command at unquoted `;`, `&`, `&&`, `|`, `||`, & newlines, dropping comments and
 * keeping arithmetic expansions whole. Heredoc bodies stay with the segment that opened them, apart
 * from its command text, so their content is never parsed as commands.
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
    if (char === "#" && (index === 0 || /\s/.test(command[index - 1]))) {
      while (index + 1 < command.length && command[index + 1] !== "\n") {
        index++;
      }
      continue;
    }
    const arithmetic = /^\$?\(\(/.exec(command.slice(index));
    if (arithmetic) {
      let depth = 0;
      let end = index;
      for (; end < command.length; end++) {
        if (command[end] === "(") {
          depth++;
        } else if (command[end] === ")" && --depth === 0) {
          break;
        }
      }
      current.command += command.slice(index, end + 1);
      index = end;
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

const FD_DUPLICATE = /\d*[<>]&(?:\d+|-)(?![^\s;|&<>])/g;
const REDIRECT = /(?<![<>])\d*(?:&>|>&|>{1,2})\|?\s*("[^"\n]+"|'[^'\n]+'|[^\s;|&<>]+)/g;
const COMMAND_PREFIX = String.raw`^\s*[({]?\s*(?:\w+=\S*\s+)*`;

/** Writing-command arguments; `cp` & `install` sources are reads, so only their destination counts. */
function commandTargets(command: string): string[] {
  const paths = shellPaths(command);
  if (!new RegExp(`${COMMAND_PREFIX}(?:cp|install)\\b`).test(command)) {
    return paths;
  }
  const args = paths.slice(1);
  const targetOption = /^(?:-(?!-)[A-Za-z]*t|--target-directory=?)/;
  const option = args.findIndex((arg) => targetOption.test(arg));
  if (option !== -1) {
    const inline = args[option].replace(targetOption, "");
    return [inline === "" ? (args[option + 1] ?? "") : inline];
  }
  return args.filter((arg) => !arg.startsWith("-")).slice(1);
}

/**
 * The paths a shell command may write: per segment, its redirect targets, the arguments of writing
 * commands, the targets of a shell script fed by heredoc, & every path in another heredoc that calls
 * a file-writing API. Reads in other segments, or on the read side of a redirect, are ignored. When
 * a write's target can't be read statically (a `cd`, `xargs`, or expansion), every path in the
 * command counts.
 */
export function shellWriteTargets(command: string): string[] {
  const segments = shellSegments(command);
  const targets: string[] = [];
  let dynamic = false;
  for (const { command: segment, heredoc } of segments) {
    const plain = segment.replaceAll(FD_DUPLICATE, " ");
    const writes = [...plain.matchAll(REDIRECT)].flatMap((match) => shellPaths(match[1]));
    const rest = plain.replaceAll(REDIRECT, " ");
    if (isShellWrite(rest)) {
      writes.push(...commandTargets(rest));
      dynamic ||= /\bxargs\b/.test(rest);
    }
    // Any shell word, so `/bin/bash`, `sudo sh`, & `env bash` feeding a heredoc count too.
    if (/(?:^|[\s/(])(?:ba|da|k|z)?sh(?=\s|$)/.test(rest)) {
      writes.push(...shellWriteTargets(heredoc));
    } else if (API_WRITE.test(heredoc)) {
      writes.push(
        ...shellPaths(heredoc),
        ...[...heredoc.matchAll(/"([^"\n]+)"|'([^'\n]+)'/g)].map((match) => match[1] ?? match[2]),
      );
    }
    targets.push(...writes.filter((target) => !target.startsWith("/dev/")));
  }
  dynamic ||= targets.some((target) => /[$`]/.test(target));
  if (
    targets.length > 0 &&
    (dynamic || segments.some(({ command: segment }) => /^\s*[({]?\s*(?:cd|pushd)\b/.test(segment)))
  ) {
    // Include assignment values, which an expanded target such as `> $f` may name.
    return [
      ...targets,
      ...segments.flatMap(({ command: segment }) =>
        shellPaths(segment).flatMap((path) => [path, path.replace(/^\w+=/, "")]),
      ),
    ];
  }
  return targets;
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

/** Hooks apply only to the event checkout & linked worktrees of the configured project. */
export function hookRepositoryRoot(cwd: string): string | undefined {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  if (result.status === 128 && /^fatal: not a git repository/m.test(result.stderr)) {
    return undefined;
  }
  if (result.status !== 0) {
    throw new Error(
      result.error?.message ?? (result.stderr.trim() || "Could not find repository root"),
    );
  }
  const root = canonicalPath(cwd, result.stdout.trim());
  const project = process.env.CLAUDE_PROJECT_DIR;
  if (project) {
    const commonDirectory = (directory: string): string => {
      const common = spawnSync("git", ["rev-parse", "--git-common-dir"], {
        cwd: directory,
        encoding: "utf8",
      });
      if (common.status !== 0) {
        throw new Error(
          common.error?.message ??
            (common.stderr.trim() || "Could not resolve Git common directory"),
        );
      }
      return canonicalPath(directory, common.stdout.trim());
    };
    if (commonDirectory(root) !== commonDirectory(project)) {
      return undefined;
    }
  }
  return root;
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
