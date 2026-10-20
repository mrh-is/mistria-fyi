import { pathToFileURL } from "node:url";

import {
  canonicalPath,
  editPaths,
  readHookInput,
  shellCommand,
  shellReadTargets,
} from "#scripts/lib/agent-hook";

import type { HookInput } from "#scripts/lib/agent-hook";

export function readGuardMessage(input: HookInput): string | undefined {
  const command = shellCommand(input);
  let targets = editPaths(input);
  if (command !== undefined) {
    targets = shellReadTargets(command);
  }
  return targets.some((target) =>
    /(?:^|\/)src\/lib\/data\/tracker-data\.json$/.test(
      canonicalPath(input.cwd ?? process.cwd(), target).replaceAll("\\", "/"),
    ),
  )
    ? "Blocked generated tracker data read. Read src/lib/types/tracker-data.ts or pipeline source instead."
    : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const message = readGuardMessage(readHookInput());
  if (message) {
    console.error(message);
    process.exitCode = 2;
  }
}
