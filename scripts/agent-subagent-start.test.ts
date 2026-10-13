import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

import { subagentContext } from "./agent-subagent-start.js";

it("injects focused-test & ownership guidance through the shared client protocol", () => {
  const result = spawnSync(process.execPath, ["scripts/agent-subagent-start.ts"], {
    encoding: "utf8",
    input: "{}",
  });
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe(subagentContext());
  const output = JSON.parse(result.stdout) as {
    hookSpecificOutput: { additionalContext: string; hookEventName: string };
  };
  expect(output.hookSpecificOutput.hookEventName).toBe("SubagentStart");
  expect(output.hookSpecificOutput.additionalContext).toContain(
    "pnpm exec vitest run path/to/file.test.ts",
  );
  expect(output.hookSpecificOutput.additionalContext).toContain("assigned files");
  expect(output.hookSpecificOutput.additionalContext).toContain("preserve other agents’ edits");
});
