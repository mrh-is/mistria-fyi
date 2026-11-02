// Both clients run matching hooks concurrently. Keep setup & formatting in one synchronous handler.
import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { formatEdit } from "#scripts/format-agent-edit";
import {
  canonicalPath,
  contextOutput,
  editPaths,
  readHookInput,
  repositoryRoot,
} from "#scripts/lib/agent-hook";
import { describeSetup, MANIFESTS, sameRepository, setupBeforeTool } from "#scripts/setup-worktree";

import type { HookInput, RunCommand } from "#scripts/lib/agent-hook";

const project = dirname(import.meta.dirname);

/** After a file edit: set up the checkout when a root manifest changed, then format the edit. */
export function agentToolHook(
  input: HookInput,
  setup = setupBeforeTool,
  run?: RunCommand,
  origin = project,
): string[] {
  const event = input.hook_event_name;
  // Claude & Codex always name the event. Copilot CLI runs these hooks with its own schema, which
  // names none, so it gets no upkeep rather than a denied tool call.
  if (event === undefined) return [];
  if (event !== "PostToolUse") {
    throw new Error("Unsupported agent tool hook event.");
  }
  if (!input.cwd) {
    throw new Error("Missing hook cwd; report the unsupported agent payload before continuing.");
  }
  const directory = input.cwd;
  if (!existsSync(directory) || !sameRepository(origin, directory)) return [];
  const cwd = realpathSync(repositoryRoot(directory));
  const messages: string[] = [];
  const manifestEdit = editPaths(input).some((file) =>
    MANIFESTS.some((name) => canonicalPath(directory, file) === resolve(cwd, name)),
  );
  if (manifestEdit) {
    const result = setup(cwd);
    if (result.installed || result.linked > 0) messages.push(describeSetup(cwd, result));
  }
  const message = formatEdit(input, run);
  if (message) throw new Error(message);
  return messages;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = readHookInput();
    const messages = agentToolHook(input);
    if (messages.length > 0) {
      console.log(contextOutput("PostToolUse", messages.join("\n")));
    }
  } catch (error) {
    console.error(
      `Agent tool upkeep failed. Report this before other work & follow AGENTS.md, Tooling failures.\n${String(error)}`,
    );
    process.exitCode = 2;
  }
}
