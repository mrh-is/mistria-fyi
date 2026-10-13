import { pathToFileURL } from "node:url";

import { contextOutput } from "#scripts/lib/agent-hook";

export function subagentContext(): string {
  return contextOutput(
    "SubagentStart",
    "Run the focused test covering your change: pnpm exec vitest run path/to/file.test.ts. Work only on your assigned files in your own isolated worktree. You are not alone in the codebase; preserve other agents’ edits, and coordinate ownership conflicts with the parent before editing.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(subagentContext());
}
