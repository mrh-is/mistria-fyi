// Codex runs matching hooks concurrently. Keep setup & formatting in this one synchronous handler.
import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { formatEdit, snapshotShellEdit } from "#scripts/format-agent-edit";
import {
  contextOutput,
  readHookInput,
  repositoryRoot,
  shellCommand,
  shellPaths,
  shellSegments,
} from "#scripts/lib/agent-hook";
import { describeSetup, sameRepository, setupBeforeTool } from "#scripts/setup-worktree";

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

/** Resolve only literal leading cd & pnpm directory options; never execute shell text in a hook. */
export function toolDirectory(input: HookInput): string {
  if (!input.cwd) {
    throw new Error("Missing hook cwd; report the unsupported Codex payload before continuing.");
  }
  let cwd = input.cwd;
  const command = shellCommand(input);
  if (command === undefined) return cwd;
  const segments = shellSegments(command);
  let last = 0;
  while (last < segments.length - 1 && /^\s*cd\s/.test(segments[last].command)) {
    if (segments[last].separator !== "&&") {
      throw new Error(
        "Use cd with && before pnpm, or run the directory change in a separate tool call.",
      );
    }
    const words = literalWords(segments[last].command);
    const path = words[1] === "--" ? words[2] : words[1];
    if (words.length !== (words[1] === "--" ? 3 : 2)) {
      throw new Error("Use a separate command for a complex directory change.");
    }
    cwd = resolve(cwd, literalPath(path));
    last++;
  }
  const remaining = segments.slice(last);
  const pnpm = remaining.filter((segment) => /\bpnpm\b/.test(segment.command));
  if (pnpm.length > 0 && remaining.length > 1) {
    throw new Error(
      "Run pnpm in a separate tool call from other commands, so setup runs after a merge or manifest change & before pnpm.",
    );
  }
  if (pnpm.length === 1) {
    const words = literalWords(pnpm[0].command);
    for (let index = 1; index < words.length; index++) {
      const word = words[index];
      if (word === "-C" || word === "--dir") {
        cwd = resolve(cwd, literalPath(words[index + 1]));
        break;
      }
      if (word.startsWith("--dir=")) {
        cwd = resolve(cwd, literalPath(word.slice("--dir=".length)));
        break;
      }
      if (word.startsWith("-C") && word.length > 2) {
        cwd = resolve(cwd, literalPath(word.slice(2)));
        break;
      }
      if (word === "--filter" || word === "-F") {
        index++;
        continue;
      }
      if (!word.startsWith("-")) break;
    }
  }
  return cwd;
}

export function codexToolHook(
  input: HookInput,
  setup = setupBeforeTool,
  run?: RunCommand,
  origin = project,
): string[] {
  const event = input.hook_event_name;
  if (event !== "PreToolUse" && event !== "PostToolUse") {
    throw new Error("Unsupported Codex tool hook event.");
  }
  let directory: string;
  try {
    directory = toolDirectory(input);
  } catch (error) {
    if (input.cwd && !sameRepository(origin, input.cwd)) return [];
    throw error;
  }
  if (!existsSync(directory) || !sameRepository(origin, directory)) return [];
  const cwd = realpathSync(repositoryRoot(directory));
  const normalized = { ...input, cwd: directory };
  const words = shellPaths(shellCommand(input) ?? "");
  // Let an explicitly requested manual repair reach the script without retrying from a hook.
  const script = words[1] && resolve(directory, words[1]);
  const manual =
    words[0] === "node" &&
    ((script === resolve(cwd, "scripts/setup-worktree.ts") &&
      (words.length === 2 || (words.length === 3 && words[2] === "--repair"))) ||
      script === resolve(cwd, "scripts/machine-doctor.ts"));
  const result = manual ? { installed: false, linked: 0, status: 0 } : setup(cwd);
  const messages = result.installed || result.linked > 0 ? [describeSetup(cwd, result)] : [];
  if (event === "PreToolUse") {
    if (input.tool_name === "Bash") snapshotShellEdit(normalized);
  } else {
    const message = formatEdit(normalized, run);
    if (message) throw new Error(message);
  }
  return messages;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = readHookInput();
    const messages = codexToolHook(input);
    if (messages.length > 0) {
      console.log(contextOutput(input.hook_event_name ?? "PostToolUse", messages.join("\n")));
    }
  } catch (error) {
    console.error(
      `Codex tool upkeep failed. Report this before other work & follow AGENTS.md, Tooling failures.\n${String(error)}`,
    );
    process.exitCode = 2;
  }
}
