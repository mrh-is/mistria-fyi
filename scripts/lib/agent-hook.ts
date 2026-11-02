import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { pnpmCommand } from "#scripts/lib/pnpm-command";

export interface HookInput {
  agent_id?: string;
  agent_transcript_path?: string;
  agent_type?: string;
  cwd?: string;
  /** `FileChanged`: `"change"`, `"add"`, or `"unlink"`. */
  event?: string;
  /** `FileChanged`: absolute path of the changed file. */
  file_path?: string;
  hook_event_name?: string;
  /** `CwdChanged`: the directories before & after the move. */
  new_cwd?: string;
  old_cwd?: string;
  session_id?: string;
  stop_hook_active?: boolean;
  /** Copilot’s Claude-compatible events include a timestamp, but no stable `tool_use_id`. */
  timestamp?: string;
  tool_input?:
    | string
    | {
        command?: unknown;
        content?: unknown;
        edits?: unknown;
        file_path?: unknown;
        /** Grep's file filter. */
        glob?: unknown;
        new_string?: unknown;
        notebook_path?: unknown;
        old_string?: unknown;
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
  return [...command.matchAll(/"([^"\n]+)"|'([^'\n]+)'|([^\s;|&<>()]+)/g)].flatMap((match) => {
    const value = match[1] ?? match[2] ?? match[3];
    return [value];
  });
}

interface ShellSegment {
  command: string;
  /** Bodies of unquoted heredocs, whose `$(…)` & backtick substitutions run as commands. */
  expanding: string;
  heredoc: string;
  /** Whether this segment's output is piped into the next one. */
  pipe: boolean;
  /** The shell operator after this segment, when present. */
  separator?: string;
}

/**
 * Split a shell command at unquoted `;`, `&`, `&&`, `|`, `||`, & newlines, dropping comments and
 * keeping arithmetic expansions whole. Heredoc bodies stay with the segment that opened them, apart
 * from its command text, so their content is never parsed as commands.
 */
export function shellSegments(command: string): ShellSegment[] {
  const segments: ShellSegment[] = [];
  let current: ShellSegment = { command: "", expanding: "", heredoc: "", pipe: false };
  let pending: { delimiter: string; expands: boolean; segment: ShellSegment; tabs: boolean }[] = [];
  let quote: string | undefined;
  const flush = () => {
    if (current.command.trim() !== "" || current.heredoc !== "") {
      segments.push(current);
    }
    current = { command: "", expanding: "", heredoc: "", pipe: false };
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
      pending.push({
        delimiter: heredoc[3],
        expands: heredoc[2] === "",
        segment: current,
        tabs: heredoc[1] === "-",
      });
      current.command += heredoc[0];
      index += heredoc[0].length - 1;
      continue;
    }
    if (char === "\n" && pending.length > 0) {
      let lineStart = index + 1;
      // Each body belongs to the segment that opened it, even when `| tail` follows on that line.
      for (const { delimiter, expands, segment, tabs } of pending) {
        while (lineStart <= command.length) {
          const lineEnd = command.indexOf("\n", lineStart);
          const end = lineEnd === -1 ? command.length : lineEnd;
          const line = command.slice(lineStart, end);
          lineStart = end + 1;
          if ((tabs ? line.replace(/^\t+/, "") : line) === delimiter) {
            break;
          }
          segment.heredoc += `${line}\n`;
          if (expands) {
            segment.expanding += `${line}\n`;
          }
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
      current.pipe = char === "|" && previous !== "|" && command[index + 1] !== "|";
      current.separator =
        (char === "&" || char === "|") && command[index + 1] === char
          ? char + command[++index]
          : char;
      flush();
      continue;
    }
    current.command += char;
  }
  flush();
  return segments;
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

/** The main checkout's root, from it or any linked worktree: the parent of Git's common directory. */
export function mainCheckoutRoot(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      result.error?.message ?? (result.stderr.trim() || "Could not resolve Git common directory"),
    );
  }
  return dirname(result.stdout.trim());
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

/**
 * Paths with unresolved index stages, relative to the repository root. Index state, not conflict
 * markers, is the boundary: Git's alternate conflict styles & marker sizes defeat a text check.
 */
export function unmergedFiles(cwd: string): Set<string> {
  const result = spawnSync("git", ["diff", "--name-only", "--diff-filter=U", "-z"], {
    cwd: repositoryRoot(cwd),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      result.error?.message ?? (result.stderr.trim() || "Could not list unmerged files"),
    );
  }
  return new Set(result.stdout.split("\0").filter(Boolean));
}

export function contextOutput(event: string, additionalContext: string): string {
  return JSON.stringify({ hookSpecificOutput: { additionalContext, hookEventName: event } });
}
