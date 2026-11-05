import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalPath,
  editPaths,
  hookRepositoryRoot,
  readHookInput,
  runPnpm,
  unmergedFiles,
} from "#scripts/lib/agent-hook";

import type { HookInput, RunCommand } from "#scripts/lib/agent-hook";

/** Formatting a file mid-conflict rewrites its markers, so those wait until they're staged. */
function formatFiles(cwd: string, targets: string[]): string[] {
  const root = canonicalPath(cwd, ".");
  const unmerged = unmergedFiles(cwd);
  return [...new Set(targets)].filter((file) => {
    const rel = relative(root, canonicalPath(cwd, file));
    return (
      !isAbsolute(rel) &&
      rel !== ".." &&
      !rel.startsWith(`..${sep}`) &&
      !unmerged.has(rel.split(sep).join("/")) &&
      existsSync(resolve(cwd, file)) &&
      statSync(resolve(cwd, file)).isFile() &&
      /\.(?:[cm]?[jt]sx?|svelte|css|jsonc?|md|html?|ya?ml|toml)$/i.test(file) &&
      !/(?:^|[/\\])src[/\\]lib[/\\](?:components[/\\]ui(?:[/\\]|$)|data[/\\]tracker-data\.json$)/.test(
        canonicalPath(cwd, file),
      )
    );
  });
}

export function formatEdit(input: HookInput, run: RunCommand = runPnpm): string | undefined {
  const eventCwd = input.cwd ?? process.cwd();
  // Tool paths are relative to the event cwd; formatter arguments are relative to the repo root.
  const targets = editPaths(input).map((file) => canonicalPath(eventCwd, file));
  const cwd = hookRepositoryRoot(eventCwd);
  if (cwd === undefined) {
    return undefined;
  }
  const files = formatFiles(cwd, targets).map((file) => relative(cwd, file));
  if (files.length === 0) {
    return undefined;
  }
  const result = run(["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", ...files], cwd);
  if (result.status === 0) {
    return undefined;
  }
  return result.output.includes("ERR_PNPM_VERIFY_DEPS_BEFORE_RUN")
    ? "Dependencies are missing or stale, so this edit wasn’t formatted. Run `node scripts/setup-worktree.ts` in a new worktree, or `pnpm install --frozen-lockfile` otherwise."
    : `Formatting failed. Report the failure before proceeding.\n${result.output}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const message = formatEdit(readHookInput());
    if (message) {
      console.error(message);
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(String(error));
    process.exitCode = 2;
  }
}
