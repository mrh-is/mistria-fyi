import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalPath,
  changedFiles,
  editPaths,
  hookRepositoryRoot,
  readHookInput,
  repositoryHead,
  runPnpm,
} from "#scripts/lib/agent-hook";

import type { HookInput, RunCommand } from "#scripts/lib/agent-hook";

function formatFiles(cwd: string, targets: string[]): string[] {
  const root = canonicalPath(cwd, ".");
  return [...new Set(targets)].filter((file) => {
    const rel = relative(root, canonicalPath(cwd, file));
    return (
      !isAbsolute(rel) &&
      rel !== ".." &&
      !rel.startsWith(`..${sep}`) &&
      existsSync(resolve(cwd, file)) &&
      statSync(resolve(cwd, file)).isFile() &&
      /\.(?:[cm]?[jt]sx?|svelte|css|jsonc?|md|html?|ya?ml|toml)$/i.test(file) &&
      !/(?:^|[/\\])src[/\\]lib[/\\](?:components[/\\]ui(?:[/\\]|$)|data[/\\]tracker-data\.json$)/.test(
        canonicalPath(cwd, file),
      )
    );
  });
}

interface Snapshot {
  cwd: string;
  hashes: Record<string, string>;
  head: string;
}

// Keyed on the tool use alone: a command that changes directory gets a different cwd in its
// PostToolUse payload than in its PreToolUse payload. The snapshot records its own repository.
function snapshotFile(input: HookInput): string {
  if (!input.tool_use_id) {
    throw new Error("Bash formatting requires tool_use_id; report the missing hook payload.");
  }
  const key = createHash("sha256").update(input.tool_use_id).digest("hex");
  return join(tmpdir(), `mistria-agent-format-${key}.json`);
}

function fingerprint(cwd: string, file: string): string {
  return createHash("sha256")
    .update(readFileSync(resolve(cwd, file)))
    .digest("hex");
}

/** Snapshot only existing dirty files; newly dirtied files are identified after the command. */
export function snapshotShellEdit(input: HookInput): void {
  const cwd = hookRepositoryRoot(input.cwd ?? process.cwd());
  if (cwd === undefined) {
    // Remember the skip if Bash later reports a cwd back inside the project.
    if (input.tool_use_id) {
      writeFileSync(snapshotFile(input), "null", { flag: "wx", mode: 0o600 });
    }
    return;
  }
  const hashes = Object.fromEntries(
    formatFiles(cwd, changedFiles(cwd)).map((file) => [file, fingerprint(cwd, file)]),
  );
  const snapshot: Snapshot = { cwd, hashes, head: repositoryHead(cwd) };
  writeFileSync(snapshotFile(input), JSON.stringify(snapshot), { flag: "wx", mode: 0o600 });
}

function shellEditFiles(input: HookInput): { cwd: string; files: string[] } {
  const file = snapshotFile(input);
  const before = JSON.parse(readFileSync(file, "utf8")) as null | Snapshot;
  rmSync(file);
  if (before === null) {
    return { cwd: input.cwd ?? process.cwd(), files: [] };
  }
  const { cwd } = before;
  const files = formatFiles(cwd, [
    ...changedFiles(cwd, before.head),
    ...Object.keys(before.hashes),
  ]).filter((target) => fingerprint(cwd, target) !== before.hashes[target]);
  return { cwd, files };
}

export function formatEdit(input: HookInput, run: RunCommand = runPnpm): string | undefined {
  let cwd = input.cwd ?? process.cwd();
  let files: string[];
  if (input.tool_name === "Bash") {
    // An in-project command may change cwd; its existing snapshot still owns the edit.
    if (
      hookRepositoryRoot(cwd) === undefined &&
      (!input.tool_use_id || !existsSync(snapshotFile(input)))
    ) {
      return undefined;
    }
    ({ cwd, files } = shellEditFiles(input));
  } else {
    // Tool paths are relative to the event cwd; formatter arguments are relative to the repo root.
    const targets = editPaths(input).map((file) => canonicalPath(cwd, file));
    const root = hookRepositoryRoot(cwd);
    if (root === undefined) {
      return undefined;
    }
    cwd = root;
    files = formatFiles(cwd, targets).map((file) => relative(cwd, file));
  }
  if (files.length === 0) {
    return undefined;
  }
  const result = run(["exec", "oxfmt", "--no-error-on-unmatched-pattern", "--", ...files], cwd);
  return result.status === 0
    ? undefined
    : `Formatting failed. Report the failure before proceeding.\n${result.output}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = readHookInput();
    if (input.hook_event_name === "PreToolUse") {
      snapshotShellEdit(input);
    } else {
      const message = formatEdit(input);
      if (message) {
        console.error(message);
        process.exitCode = 2;
      }
    }
  } catch (error) {
    console.error(String(error));
    process.exitCode = 2;
  }
}
