// Both clients run matching hooks concurrently. Keep setup & formatting in one synchronous handler.
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { formatEdit, snapshotShellEdit } from "#scripts/format-agent-edit";
import {
  canonicalPath,
  contextOutput,
  editPaths,
  readHookInput,
  repositoryRoot,
  shellCommand,
  shellPaths,
  shellSegments,
} from "#scripts/lib/agent-hook";
import { describeSetup, MANIFESTS, sameRepository, setupBeforeTool } from "#scripts/setup-worktree";

import type { HookInput, RunCommand } from "#scripts/lib/agent-hook";

const project = dirname(import.meta.dirname);

function literalPath(word: string | undefined): string {
  if (!word || word === "-" || /[$`\\~*?{}()<>]/.test(word)) {
    throw new Error(
      "Use an explicit workdir or a literal directory for setup; dynamic shell paths cannot be resolved by the hook.",
    );
  }
  return word;
}

/** Join adjacent quoted & unquoted sections as the shell does, without evaluating expansions. */
function literalWords(command: string): string[] {
  const words: string[] = [];
  let word = "";
  let started = false;
  let quote: string | undefined;
  for (let index = 0; index < command.length; index++) {
    const character = command[index];
    if (character === "\\" && quote !== "'") {
      // Preserve escapes so literalPath rejects them rather than guessing their shell meaning.
      word += character + (command[++index] ?? "");
    } else if (quote !== undefined) {
      if (character === quote) quote = undefined;
      else word += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (started) words.push(word);
      word = "";
      started = false;
      continue;
    } else {
      word += character;
    }
    started = true;
  }
  if (quote !== undefined) throw new Error("Use complete literal quotes for a command directory.");
  if (started) words.push(word);
  return words;
}

/** Drop literal environment assignments without evaluating their values. */
function commandWords(command: string): string[] {
  const words = literalWords(command);
  while (words[0] && /^[A-Za-z_]\w*=/.test(words[0])) words.shift();
  return words;
}

/** Git global options with a separate value must not be mistaken for the subcommand. */
function gitChangesManifests(words: string[]): boolean {
  if (basename(words[0] ?? "") !== "git") return false;
  for (let index = 1; index < words.length; index++) {
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(words[index])) {
      index++;
      continue;
    }
    if (!words[index].startsWith("-")) {
      return ["pull", "merge", "rebase", "checkout", "switch"].includes(words[index]);
    }
  }
  return false;
}

function pnpmDirectory(cwd: string, words: string[]): string {
  for (let index = 1; index < words.length; index++) {
    const word = words[index];
    if (word === "-C" || word === "--dir") return resolve(cwd, literalPath(words[index + 1]));
    if (word.startsWith("--dir=")) return resolve(cwd, literalPath(word.slice("--dir=".length)));
    if (word.startsWith("-C") && word.length > 2) return resolve(cwd, literalPath(word.slice(2)));
    if (word === "--filter" || word === "-F") index++;
    else if (!word.startsWith("-")) break;
  }
  return cwd;
}

/** Resolve literal command directories; never execute shell text or reject ordinary pnpm chains. */
export function toolDirectories(input: HookInput): string[] {
  if (!input.cwd) {
    throw new Error("Missing hook cwd; report the unsupported agent payload before continuing.");
  }
  let cwd = input.cwd;
  const command = shellCommand(input);
  if (command === undefined) return [cwd];
  const segments = shellSegments(command);
  const directories: string[] = [];
  let manifestsChanged = false;
  for (const [index, segment] of segments.entries()) {
    const words = commandWords(segment.command);
    if (words[0] === "cd") {
      try {
        if (segment.separator !== undefined && segment.separator !== "&&") {
          throw new Error(
            "Use cd with && before pnpm, or run the directory change in a separate tool call.",
          );
        }
        const path = words[1] === "--" ? words[2] : words[1];
        if (words.length !== (words[1] === "--" ? 3 : 2)) {
          throw new Error("Use a separate command for a complex directory change.");
        }
        cwd = resolve(cwd, literalPath(path));
      } catch (error) {
        const laterPnpm = segments
          .slice(index + 1)
          .some((later) => basename(commandWords(later.command)[0] ?? "") === "pnpm");
        if (laterPnpm) throw error;
        // Navigation alone needs no dependency target. Keep the last known snapshot directory &
        // stop interpreting later paths, which may now be relative to an unknown shell directory.
        directories.push(cwd);
        break;
      }
      continue;
    }
    const pnpm = basename(words[0] ?? "") === "pnpm";
    if (pnpm && manifestsChanged) {
      throw new Error(
        "Run a manifest-changing Git operation & the following pnpm command in a separate tool call each, so setup can run between them.",
      );
    }
    directories.push(pnpm ? pnpmDirectory(cwd, words) : cwd);
    manifestsChanged ||= gitChangesManifests(words);
  }
  return [...new Set(directories.length > 0 ? directories : [cwd])];
}

export function agentToolHook(
  input: HookInput,
  setup = setupBeforeTool,
  run?: RunCommand,
  origin = project,
): string[] {
  const event = input.hook_event_name;
  if (event !== "PreToolUse" && event !== "PostToolUse" && event !== "PostToolUseFailure") {
    throw new Error("Unsupported agent tool hook event.");
  }
  let directories: string[];
  try {
    directories = toolDirectories(input);
  } catch (error) {
    if (input.cwd && !sameRepository(origin, input.cwd)) return [];
    throw error;
  }
  const messages: string[] = [];
  const checked = new Set<string>();
  for (const directory of directories) {
    if (!existsSync(directory) || !sameRepository(origin, directory)) continue;
    const cwd = realpathSync(repositoryRoot(directory));
    if (checked.has(cwd)) continue;
    checked.add(cwd);
    const normalized = {
      ...input,
      cwd: directory,
      tool_use_id:
        input.tool_name === "Bash" && input.tool_use_id
          ? `${input.tool_use_id}:${cwd}`
          : input.tool_use_id,
    };
    const words = shellPaths(shellCommand(input) ?? "");
    // Let an explicitly requested manual repair reach the script without retrying from a hook.
    const script = words[1] && resolve(directory, words[1]);
    const manual =
      words[0] === "node" &&
      ((script === resolve(cwd, "scripts/setup-worktree.ts") &&
        (words.length === 2 || (words.length === 3 && words[2] === "--repair"))) ||
        script === resolve(cwd, "scripts/machine-doctor.ts"));
    const manifestEdit = editPaths(input).some((file) =>
      MANIFESTS.some((name) => canonicalPath(directory, file) === resolve(cwd, name)),
    );
    if (!manual && (input.tool_name === "Bash" || manifestEdit)) {
      const result = setup(cwd);
      if (result.installed || result.linked > 0) messages.push(describeSetup(cwd, result));
    }
    if (event === "PreToolUse") {
      if (input.tool_name === "Bash") snapshotShellEdit(normalized);
    } else {
      const message = formatEdit(normalized, run);
      if (message) throw new Error(message);
    }
  }
  return messages;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = readHookInput();
    const messages = agentToolHook(input);
    if (messages.length > 0) {
      console.log(contextOutput(input.hook_event_name ?? "PostToolUse", messages.join("\n")));
    }
  } catch (error) {
    console.error(
      `Agent tool upkeep failed. Report this before other work & follow AGENTS.md, Tooling failures.\n${String(error)}`,
    );
    process.exitCode = 2;
  }
}
