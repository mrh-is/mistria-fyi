// The one `PostToolUse` handler for every client: formats file edits in this repository.
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { formatEdit } from "#scripts/format-agent-edit";
import { readHookInput, sameRepository } from "#scripts/lib/agent-hook";

import type { HookInput, RunCommand } from "#scripts/lib/agent-hook";

const project = dirname(import.meta.dirname);

/**
 * After a file edit: formats it, when the event belongs to a checkout of this repository. Returns
 * the formatter's own instructions for the agent, and throws on an unexpected payload or Git failure.
 */
export function agentToolHook(
  input: HookInput,
  run?: RunCommand,
  origin = project,
): string | undefined {
  const event = input.hook_event_name;
  // Claude & Codex always name the event. Copilot CLI runs these hooks with its own schema, which
  // names none, so it gets no upkeep rather than a denied tool call.
  if (event === undefined) return undefined;
  if (event !== "PostToolUse") {
    throw new Error("Unsupported agent tool hook event.");
  }
  if (!input.cwd) {
    throw new Error("Missing hook cwd; report the unsupported agent payload before continuing.");
  }
  if (!existsSync(input.cwd) || !sameRepository(origin, input.cwd)) return undefined;
  return formatEdit(input, run);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const message = agentToolHook(readHookInput());
    if (message) {
      console.error(message);
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(
      `Agent tool upkeep failed. Report this before other work & follow AGENTS.md, Tooling failures.\n${String(error)}`,
    );
    process.exitCode = 2;
  }
}
