import { pathToFileURL } from "node:url";

import { changedFiles, hookRepositoryRoot, readHookInput, runPnpm } from "#scripts/lib/agent-hook";

import type { HookInput, RunCommand } from "#scripts/lib/agent-hook";

export function stopLint(
  input: HookInput,
  files: string[],
  run: RunCommand = runPnpm,
): object | undefined {
  if (files.length === 0) {
    return undefined;
  }
  const cwd = input.cwd ?? process.cwd();
  const fix = run(["run", "lint:fix", "--files", ...files], cwd);
  const lint = run(["run", "lint", "--files", ...files], cwd);
  if (fix.status === 0 && lint.status === 0) {
    return undefined;
  }
  const reason = `Changed-file lint failed. Fix the reported errors, or report a tooling blocker; do not skip the check.\n${fix.output}\n${lint.output}`;
  // One continuation gives the agent a chance to fix or report; never create an unfixable loop.
  return input.stop_hook_active
    ? { systemMessage: `Lint still fails; finish with a failure report.\n${reason}` }
    : { decision: "block", reason };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = readHookInput();
  try {
    input.cwd = hookRepositoryRoot(input.cwd ?? process.cwd());
    const output =
      input.cwd === undefined ? undefined : stopLint(input, changedFiles(input.cwd, true));
    if (output) {
      console.log(JSON.stringify(output));
    }
  } catch (error) {
    console.log(
      JSON.stringify(
        input.stop_hook_active
          ? { systemMessage: `Report the lint hook failure: ${String(error)}` }
          : { decision: "block", reason: String(error) },
      ),
    );
  }
}
