import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { pnpmCommand } from "#scripts/lib/pnpm-command";

export interface HookInput {
  cwd?: string;
  hook_event_name?: string;
  session_id?: string;
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

function commonDirOf(directory: string): string | undefined {
  const result = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: directory,
    encoding: "utf8",
  });
  return result.status === 0 ? realpathSync(result.stdout.trim()) : undefined;
}

/** Whether `directory` is a checkout (main or linked) of the repository holding `origin`. */
export function sameRepository(origin: string, directory: string): boolean {
  const target = commonDirOf(directory);
  return target !== undefined && target === commonDirOf(origin);
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
