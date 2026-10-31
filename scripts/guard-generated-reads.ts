import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalPath,
  editPaths,
  readHookInput,
  shellCommand,
  shellReadTargets,
} from "#scripts/lib/agent-hook";

import type { HookInput } from "#scripts/lib/agent-hook";

const tokenFilePatterns = [
  /(?:^|\/)\.config\/gh\/hosts\.yml$/,
  /(?:^|\/)\.wrangler\/config\/[^/]+\.toml$/,
];

export function readGuardMessage(input: HookInput): string | undefined {
  const command = shellCommand(input);
  let targets = editPaths(input);
  if (command !== undefined) {
    targets = shellReadTargets(command);
  }
  const cwd = input.cwd ?? process.cwd();
  const paths = targets.flatMap((target) =>
    [resolve(cwd, target), canonicalPath(cwd, target)].map((path) => path.replaceAll("\\", "/")),
  );
  if (paths.some((path) => /(?:^|\/)src\/lib\/data\/tracker-data\.json$/.test(path))) {
    return "Blocked generated tracker data read. Read src/lib/types/tracker-data.ts or pipeline source instead.";
  }
  if (paths.some((path) => tokenFilePatterns.some((pattern) => pattern.test(path)))) {
    return "Blocked read of a stored OAuth token file. Use `gh auth status` or `pnpm exec wrangler whoami` instead.";
  }
  return undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const message = readGuardMessage(readHookInput());
  if (message) {
    console.error(message);
    process.exitCode = 2;
  }
}
